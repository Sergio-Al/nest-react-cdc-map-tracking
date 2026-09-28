/**
 * External ERP demo: write to MySQL directly, then observe Debezium → Kafka → PG.
 * Node >=22.18, no npm dependencies. Requires the local Docker stack for live modes.
 *
 *   node scripts/simulate-erp.mts --once [--with-routes --drive]
 *   node scripts/simulate-erp.mts --once --pause-connector
 *   node scripts/simulate-erp.mts --business-day --interval 60
 *   node scripts/simulate-erp.mts --dry-run --once
 *   node scripts/simulate-erp.mts --list-runs
 *   node scripts/simulate-erp.mts --clear <run-id>
 *
 * Mutations are tagged and saved in scripts/.erp-runs/<run-id>.json. --clear
 * restores pre-existing rows, deletes run-created orders/products, and removes
 * a route created by --with-routes (including its own visit/history rows).
 */
import { parseArgs } from 'node:util';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const { values: opts } = parseArgs({ options: {
  once: { type: 'boolean', default: false },
  'business-day': { type: 'boolean', default: false },
  'with-routes': { type: 'boolean', default: false },
  drive: { type: 'boolean', default: false },
  'pause-connector': { type: 'boolean', default: false },
  'dry-run': { type: 'boolean', default: false },
  clear: { type: 'string' },
  'list-runs': { type: 'boolean', default: false },
  interval: { type: 'string', default: '60' },
  api: { type: 'string', default: 'http://localhost:3000' },
  connect: { type: 'string', default: 'http://localhost:8083' },
  email: { type: 'string', default: 'admin@tenant1.com' },
  password: { type: 'string', default: 'admin123' },
  tenant: { type: 'string', default: 'tenant-1' },
  help: { type: 'boolean', short: 'h', default: false },
} });

const RUN_DIR = join(dirname(fileURLToPath(import.meta.url)), '.erp-runs');
const API = opts.api!.replace(/\/$/, '') + '/api';
const CONNECT = opts.connect!.replace(/\/$/, '');
const CONNECTOR = 'mysql-cdc-v4';
const WAIT_MS = 120_000;
const POLL_MS = 500;
let stopping = false;
process.on('SIGINT', () => { stopping = true; console.log('\nStopping after this change; the run manifest is retained.'); });

interface OrderRow { id: number; customerId: number; orderNumber: string; status: string }
interface CustomerRow { id: number; tenantId: string; name: string; latitude: number | null; longitude: number | null; geofenceRadiusMeters: number; zone: string | null }
interface ProductRow { id: number; unitPrice: number; category: string | null }
interface AccountRow { id: number; name: string }
interface RouteRecord { id: string; visitIds: string[]; driveStartedAt?: string; driveEndedAt?: string }
interface RunManifest {
  version: 1;
  id: string;
  tenantId: string;
  createdAt: string;
  orders: OrderRow[];
  createdProducts: number[];
  customerOriginals: CustomerRow[];
  customerRevision: number;
  productOriginal?: ProductRow;
  accountOriginal?: AccountRow;
  route?: RouteRecord;
}

function ensureRunId(id: string): void {
  if (!/^[0-9a-f]{8}$/.test(id)) throw new Error('Run ID must be eight lowercase hex characters.');
}
function manifestPath(id: string): string { ensureRunId(id); return join(RUN_DIR, `${id}.json`); }
function save(manifest: RunManifest): void {
  mkdirSync(RUN_DIR, { recursive: true });
  const path = manifestPath(manifest.id);
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  renameSync(temp, path);
}
function load(id: string): RunManifest {
  const result = JSON.parse(readFileSync(manifestPath(id), 'utf8')) as RunManifest;
  if (result.version !== 1 || result.id !== id) throw new Error(`Invalid manifest for ${id}`);
  return result;
}
function listRuns(): void {
  if (!existsSync(RUN_DIR)) return console.log('No ERP runs recorded.');
  const names = readdirSync(RUN_DIR).filter((name) => /^[0-9a-f]{8}\.json$/.test(name));
  if (!names.length) return console.log('No ERP runs recorded.');
  for (const name of names) {
    const m = load(name.slice(0, 8));
    console.log(`${m.id}  ${m.tenantId}  ${m.createdAt}  ${m.orders.length} orders${m.route ? `  route ${m.route.id}` : ''}`);
  }
}

// Hex SQL literals avoid quoting issues for generated values and CLI-provided tenant IDs.
function myStr(value: string | null | undefined): string {
  return value == null ? 'NULL' : value === '' ? "''" : `CONVERT(0x${Buffer.from(value, 'utf8').toString('hex')} USING utf8mb4)`;
}
function pgStr(value: string): string { return `'${value.replace(/'/g, "''")}'`; }
function decimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric SQL value: ${value}`);
  return String(value);
}
function dockerSql(container: string, args: string[], sql: string): string {
  const result = spawnSync('docker', ['exec', '-i', container, ...args], {
    input: sql + '\n', encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${container} SQL failed: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout.trim();
}
function mysql(sql: string): string {
  return dockerSql('mysql', ['mysql', '--default-character-set=utf8mb4', '-uroot', '-proot_secret', '--batch', '--raw', '--skip-column-names', 'core_business'], sql);
}
function pg(sql: string): string {
  return dockerSql('cache-db', ['psql', '-U', 'tracking', '-d', 'tracking_cache', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], sql);
}
function timescale(sql: string): string {
  return dockerSql('timescale', ['psql', '-U', 'timescale', '-d', 'tracking_history', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], sql);
}
function rows<T>(sql: string): T[] {
  const output = mysql(sql);
  return output ? output.split('\n').map((line) => JSON.parse(line) as T) : [];
}
function one<T>(sql: string): T | null { return rows<T>(sql)[0] ?? null; }
function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function visible(label: string, query: string, committedAt: number): Promise<void> {
  const deadline = performance.now() + WAIT_MS;
  while (performance.now() < deadline) {
    if (pg(`SELECT EXISTS(${query});`) === 't') {
      console.log(`  CDC ${label}: ${(performance.now() - committedAt).toFixed(0)} ms MySQL acknowledgment → PG visible`);
      return;
    }
    await sleep(POLL_MS);
  }
  throw new Error(`CDC timeout for ${label}; the run manifest is saved for inspection/cleanup.`);
}
function started(): number { return performance.now(); }

class Api {
  private accessToken = '';
  private refreshToken = '';
  async login(): Promise<void> {
    const response = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: opts.email, password: opts.password, tenantId: opts.tenant }) });
    if (!response.ok) throw new Error(`API login failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as { accessToken: string; refreshToken: string };
    this.accessToken = data.accessToken; this.refreshToken = data.refreshToken;
  }
  private async refresh(): Promise<void> {
    const response = await fetch(`${API}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken }) });
    if (!response.ok) throw new Error(`API token refresh failed: ${response.status}`);
    const data = await response.json() as { accessToken: string; refreshToken: string };
    this.accessToken = data.accessToken; this.refreshToken = data.refreshToken;
  }
  async request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
    const response = await fetch(`${API}${path}`, { method,
      headers: { authorization: `Bearer ${this.accessToken}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401 && retry) { await this.refresh(); return this.request<T>(method, path, body, false); }
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return await response.json() as T;
  }
  get<T>(path: string): Promise<T> { return this.request<T>('GET', path); }
  post<T>(path: string, body: unknown): Promise<T> { return this.request<T>('POST', path, body); }
  patch<T>(path: string, body: unknown): Promise<T> { return this.request<T>('PATCH', path, body); }
}

async function preflight(api: Api): Promise<CustomerRow[]> {
  const ent = await api.get<{ integrationAllowed: boolean; integrationMode: string }>('/me/entitlements');
  if (!ent.integrationAllowed || ent.integrationMode !== 'integrated') {
    throw new Error('ERP integration requires a Business-tier tenant with integration enabled (integrationAllowed=true, integrationMode=integrated). GPS tracking remains available on every tier.');
  }
  const tenant = myStr(opts.tenant!);
  const account = one<{ id: number }>(`SELECT JSON_OBJECT('id',id) FROM accounts WHERE tenant_id=${tenant} LIMIT 1;`);
  if (!account) throw new Error(`No MySQL account for tenant ${opts.tenant}; this simulator cannot provision a tenant.`);
  const customers = rows<CustomerRow>(`SELECT JSON_OBJECT('id',id,'tenantId',tenant_id,'name',name,'latitude',latitude,'longitude',longitude,'geofenceRadiusMeters',geofence_radius_meters,'zone',zone) FROM customers WHERE tenant_id=${tenant} AND id BETWEEN 1001 AND 1023 AND active=1 AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY id;`);
  if (customers.length < 3) throw new Error('Need at least three CDC-owned La Paz customers (MySQL IDs 1001–1023). Apply the seed migration and clean-reset first.');
  const cached = pg(`SELECT count(*) FROM customers_cache WHERE tenant_id=${pgStr(opts.tenant!)} AND id BETWEEN 1001 AND 1023;`);
  if (Number(cached) < customers.length) throw new Error('La Paz customers have not finished their initial CDC sync into PostgreSQL.');
  console.log(`Business integration active · ${customers.length} La Paz customers available`);
  return customers;
}

function createOrder(m: RunManifest, customer: CustomerRow, n: number): { row: OrderRow; at: number } {
  const number = `ERP-${m.id}-${String(n).padStart(3, '0')}`;
  const sql = `START TRANSACTION; INSERT INTO orders (tenant_id,customer_id,order_number,status,total_amount,delivery_date,notes,correlation_id) VALUES (${myStr(m.tenantId)},${decimal(customer.id)},${myStr(number)},'pending',${decimal(95 + n * 17.5)},CURRENT_DATE(),${myStr(`ERP run ${m.id}`)},${myStr(randomUUID())}); COMMIT; SELECT JSON_OBJECT('id',LAST_INSERT_ID(),'customerId',${decimal(customer.id)},'orderNumber',${myStr(number)},'status','pending');`;
  const row = JSON.parse(mysql(sql).split('\n').at(-1)!) as OrderRow;
  const at = started();
  m.orders.push(row); save(m);
  console.log(`MySQL order ${row.orderNumber} (#${row.id}) → customer ${customer.name}`);
  return { row, at };
}
async function waitOrder(row: OrderRow, at: number): Promise<void> {
  await visible(row.orderNumber, `SELECT 1 FROM orders_cache WHERE id=${decimal(row.id)} AND tenant_id=${pgStr(opts.tenant!)} AND order_number=${pgStr(row.orderNumber)}`, at);
}
async function cancelOrder(m: RunManifest, row: OrderRow): Promise<void> {
  const affected = mysql(`UPDATE orders SET status='cancelled' WHERE id=${decimal(row.id)} AND tenant_id=${myStr(m.tenantId)} AND order_number=${myStr(row.orderNumber)} AND status='pending'; SELECT ROW_COUNT();`);
  if (Number(affected.split('\n').at(-1)) !== 1) throw new Error(`Order ${row.orderNumber} was not pending in MySQL; refusing to claim a cancellation.`);
  const at = started(); row.status = 'cancelled'; save(m);
  await visible(`cancel ${row.orderNumber}`, `SELECT 1 FROM orders_cache WHERE id=${decimal(row.id)} AND tenant_id=${pgStr(m.tenantId)} AND status='cancelled'`, at);
}

async function moveCustomer(m: RunManifest, customer: CustomerRow): Promise<void> {
  if (!m.customerOriginals.some((row) => row.id === customer.id)) {
    m.customerOriginals.push(customer); save(m);
  }
  m.customerRevision++;
  save(m);
  const lat = Number(customer.latitude) + m.customerRevision * 0.00009;
  const lon = Number(customer.longitude) + m.customerRevision * 0.00009;
  const radius = Number(customer.geofenceRadiusMeters) + 20 + m.customerRevision;
  const zone = `ERP ${m.id}-${m.customerRevision}`;
  mysql(`UPDATE customers SET latitude=${decimal(lat)},longitude=${decimal(lon)},geofence_radius_meters=${decimal(radius)},zone=${myStr(zone)} WHERE id=${decimal(customer.id)} AND tenant_id=${myStr(m.tenantId)};`);
  const at = started();
  await visible(`customer #${customer.id} moved`, `SELECT 1 FROM customers_cache WHERE id=${decimal(customer.id)} AND tenant_id=${pgStr(m.tenantId)} AND zone=${pgStr(zone)} AND geofence_radius_meters=${decimal(radius)}`, at);
}
async function editProduct(m: RunManifest): Promise<void> {
  const tenant = myStr(m.tenantId);
  // Never edit another ERP run's demo product. Concurrent runs must keep their
  // own cleanup boundaries even when there are no pre-existing products.
  let product = one<ProductRow>(`SELECT JSON_OBJECT('id',id,'unitPrice',unit_price,'category',category) FROM products WHERE tenant_id=${tenant} AND sku NOT LIKE 'ERP-%' ORDER BY id LIMIT 1;`);
  if (!product && m.createdProducts.length) {
    product = one<ProductRow>(`SELECT JSON_OBJECT('id',id,'unitPrice',unit_price,'category',category) FROM products WHERE tenant_id=${tenant} AND id=${decimal(m.createdProducts[0])} AND sku=${myStr(`ERP-${m.id}`)};`);
  }
  if (!product) {
    const sku = `ERP-${m.id}`;
    const output = mysql(`START TRANSACTION; INSERT INTO products (tenant_id,name,sku,category,unit_price) VALUES (${tenant},${myStr(`ERP demo product ${m.id}`)},${myStr(sku)},'demo',25.00); COMMIT; SELECT JSON_OBJECT('id',LAST_INSERT_ID(),'unitPrice',25.00,'category','demo');`);
    product = JSON.parse(output.split('\n').at(-1)!) as ProductRow;
    m.createdProducts.push(product.id); save(m);
    const at = started();
    await visible(`product #${product.id} created`, `SELECT 1 FROM products_cache WHERE id=${decimal(product.id)} AND tenant_id=${pgStr(m.tenantId)} AND sku=${pgStr(sku)}`, at);
  } else if (!m.createdProducts.includes(product.id) && !m.productOriginal) { m.productOriginal = product; save(m); }
  const price = Number(product.unitPrice) + 5.5;
  const category = `ERP ${m.id}`;
  mysql(`UPDATE products SET unit_price=${decimal(price)},category=${myStr(category)} WHERE id=${decimal(product.id)} AND tenant_id=${tenant};`);
  const at = started();
  await visible(`product #${product.id} price`, `SELECT 1 FROM products_cache WHERE id=${decimal(product.id)} AND tenant_id=${pgStr(m.tenantId)} AND category=${pgStr(category)} AND unit_price=${decimal(price)}`, at);
}
async function editAccount(m: RunManifest): Promise<void> {
  const account = one<AccountRow>(`SELECT JSON_OBJECT('id',id,'name',name) FROM accounts WHERE tenant_id=${myStr(m.tenantId)} ORDER BY id LIMIT 1;`);
  if (!account) throw new Error('MySQL account disappeared.');
  if (!m.accountOriginal) { m.accountOriginal = account; save(m); }
  const name = `${m.accountOriginal!.name} - ERP ${m.id}`;
  mysql(`UPDATE accounts SET name=${myStr(name)} WHERE id=${decimal(account.id)} AND tenant_id=${myStr(m.tenantId)};`);
  const at = started();
  await visible(`account #${account.id}`, `SELECT 1 FROM accounts_cache WHERE id=${decimal(account.id)} AND tenant_id=${pgStr(m.tenantId)} AND name=${pgStr(name)}`, at);
}

async function connectorAction(action: 'pause' | 'resume'): Promise<void> {
  const response = await fetch(`${CONNECT}/connectors/${CONNECTOR}/${action}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Kafka Connect ${action} failed: ${response.status} ${await response.text()}`);
  const expected = action === 'pause' ? 'PAUSED' : 'RUNNING';
  const deadline = performance.now() + 30_000;
  while (performance.now() < deadline) {
    const statusResponse = await fetch(`${CONNECT}/connectors/${CONNECTOR}/status`);
    if (!statusResponse.ok) throw new Error(`Kafka Connect status failed: ${statusResponse.status}`);
    const status = await statusResponse.json() as { connector?: { state?: string }; tasks?: { state?: string }[] };
    if (status.connector?.state === expected && (status.tasks ?? []).every((task) => task.state === expected)) {
      console.log(`Connector ${expected.toLowerCase()}`); return;
    }
    await sleep(500);
  }
  throw new Error(`Connector did not reach ${expected} within 30 seconds.`);
}

async function connectorState(): Promise<string> {
  const response = await fetch(`${CONNECT}/connectors/${CONNECTOR}/status`);
  if (!response.ok) throw new Error(`Kafka Connect status failed: ${response.status} ${await response.text()}`);
  const status = await response.json() as { connector?: { state?: string }; tasks?: { state?: string }[] };
  if (status.connector?.state !== 'RUNNING' || !(status.tasks ?? []).every((task) => task.state === 'RUNNING')) {
    throw new Error(`Connector is ${status.connector?.state ?? 'unknown'}; refusing --pause-connector so an existing operator pause is preserved.`);
  }
  return status.connector.state;
}

async function routeOrders(api: Api, m: RunManifest): Promise<RouteRecord> {
  const deliver = m.orders.filter((order) => order.status === 'pending');
  if (!deliver.length) throw new Error('No pending ERP orders to route.');
  // The backend's "today" is the La Paz civil day (DEFAULT_TZ), not the UTC day.
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const drivers = await api.get<{ id: string; name: string; deviceId: string | null; status: string }[]>('/drivers');
  const existing = await api.get<{ driverId: string; status: string }[]>(`/routes?from=${day}&to=${day}`);
  const busy = new Set(existing.filter((route) => route.status !== 'cancelled').map((route) => route.driverId));
  const driver = drivers.find((candidate) => candidate.deviceId && candidate.status !== 'inactive' && !busy.has(candidate.id));
  if (!driver) throw new Error('No free driver with a paired device for UTC today.');
  const customers = await api.get<{ id: number; latitude: number | null; longitude: number | null }[]>('/customers');
  const byId = new Map(customers.map((customer) => [Number(customer.id), customer]));
  for (const order of deliver) {
    const customer = byId.get(Number(order.customerId));
    if (!customer || customer.latitude == null || customer.longitude == null) throw new Error(`Customer ${order.customerId} has not reached the API with coordinates.`);
  }
  const route = await api.post<{ id: string }>('/routes', { tenantId: m.tenantId, driverId: driver.id, scheduledDate: day,
    depotLat: -16.5, depotLon: -68.13, depotLabel: `ERP ${m.id}`, returnToDepot: true });
  const record: RouteRecord = { id: route.id, visitIds: [] };
  m.route = record; save(m);
  for (const [index, order] of deliver.entries()) {
    const visit = await api.post<{ id: string }>('/visits', { tenantId: m.tenantId, routeId: route.id, driverId: driver.id,
      customerId: Number(order.customerId), orderId: Number(order.id), sequenceNumber: index + 1,
      scheduledDate: day, visitType: 'delivery', notes: `ERP run ${m.id}` });
    record.visitIds.push(visit.id); save(m);
  }
  await api.patch('/routes/' + route.id, { status: 'in_progress' });
  console.log(`Route ${route.id} started for ${driver.name}: ${deliver.length} linked orders`);
  return record;
}

async function driveRoute(api: Api, m: RunManifest, record: RouteRecord): Promise<void> {
  record.driveStartedAt = new Date().toISOString(); save(m);
  const args = [fileURLToPath(new URL('./simulate-route.mts', import.meta.url)), '--route', record.id,
    '--tenant', m.tenantId, '--email', opts.email!, '--password', opts.password!, '--api', opts.api!];
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (exitCode) => resolve(exitCode ?? 1));
  });
  record.driveEndedAt = new Date().toISOString(); save(m);
  if (code !== 0) throw new Error(`Route simulator exited ${code}; manifest retained.`);
  const visits = await api.get<{ orderId: number | null; completedAt: string | null }[]>(`/visits/route/${record.id}`);
  for (const visit of visits) {
    if (visit.orderId == null || !visit.completedAt) continue;
    const orderId = Number(visit.orderId);
    // The visit timestamp is the write-back origin. This includes the time spent
    // finishing the route process and is therefore an approximate end-to-end leg.
    await visible(`write-back order #${orderId}`, `SELECT 1 FROM orders_cache WHERE id=${decimal(orderId)} AND tenant_id=${pgStr(m.tenantId)} AND status='completed'`, performance.now() - (Date.now() - new Date(visit.completedAt).getTime()));
  }
}

async function once(api: Api, customers: CustomerRow[], m: RunManifest): Promise<void> {
  const pending: { row: OrderRow; at: number }[] = [];
  let paused = false;
  try {
    if (opts['pause-connector']) { await connectorState(); paused = true; await connectorAction('pause'); }
    for (let i = 0; i < 3; i++) pending.push(createOrder(m, customers[i], i + 1));
    if (paused) { console.log('Three MySQL commits are waiting in the binlog; resuming CDC…'); await connectorAction('resume'); paused = false; }
  } finally {
    if (paused) await connectorAction('resume');
  }
  for (const { row, at } of pending) await waitOrder(row, at);
  await moveCustomer(m, customers[0]);
  await editProduct(m);
  await editAccount(m);
  await cancelOrder(m, pending[2].row);
  if (opts['with-routes']) {
    const record = await routeOrders(api, m);
    if (opts.drive) await driveRoute(api, m, record);
  }
  console.log(`Done. Open /orders, /customers, /routes and /monitoring. Cleanup: node scripts/simulate-erp.mts --clear ${m.id}`);
}

async function businessDay(customers: CustomerRow[], m: RunManifest, intervalSeconds: number): Promise<void> {
  console.log(`Streaming ERP orders every ${intervalSeconds}s. Ctrl-C finishes the current change. Run ${m.id}`);
  let n = 0;
  while (!stopping) {
    n++;
    const created = createOrder(m, customers[(n - 1) % customers.length], n);
    await waitOrder(created.row, created.at);
    if (n % 5 === 0) await cancelOrder(m, created.row);
    if (n % 6 === 0) await moveCustomer(m, customers[n % customers.length]);
    if (n % 7 === 0) await editProduct(m);
    if (!stopping) await sleep(intervalSeconds * 1000);
  }
  console.log(`Stopped. Cleanup: node scripts/simulate-erp.mts --clear ${m.id}`);
}

async function clearRun(m: RunManifest): Promise<void> {
  const tenant = pgStr(m.tenantId);
  const failures: string[] = [];
  const step = async (label: string, action: () => Promise<void> | void): Promise<void> => {
    try { await action(); }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`${label}: ${reason}`);
      console.error(`Cleanup failed for ${label}: ${reason}`);
    }
  };

  await step('route', () => {
    if (!m.route) return;
    const routeId = pgStr(m.route.id);
    const marker = pgStr(`ERP ${m.id}`);
    const owned = pg(`SELECT EXISTS(SELECT 1 FROM routes WHERE id=${routeId} AND tenant_id=${tenant} AND depot_label=${marker});`);
    if (owned !== 't') {
      if (pg(`SELECT EXISTS(SELECT 1 FROM routes WHERE id=${routeId});`) === 't') throw new Error('Route exists but no longer carries this run marker.');
      console.log(`Run route ${m.route.id} already removed.`);
      return;
    }
    const visits = m.route.visitIds.map(pgStr).join(',');
    const outside = Number(pg(`SELECT count(*) FROM planned_visits WHERE route_id=${routeId}${visits ? ` AND id NOT IN (${visits})` : ''};`));
    if (outside) throw new Error('Route has visits not recorded in this run; refusing cleanup.');
    timescale(`DELETE FROM enriched_positions WHERE route_id=${routeId};${visits ? ` DELETE FROM visit_completions WHERE visit_id IN (${visits});` : ''}`);
    pg(`BEGIN;${visits ? ` DELETE FROM planned_visits WHERE id IN (${visits}) AND route_id=${routeId} AND tenant_id=${tenant};` : ''} DELETE FROM routes WHERE id=${routeId} AND tenant_id=${tenant} AND depot_label=${marker}; COMMIT;`);
    console.log(`Removed run route ${m.route.id} and its recorded visits/history.`);
  });

  await step('orders', async () => {
    // Re-discover tagged rows after a crash between COMMIT and manifest save.
    const tagged = rows<{ id: number }>(`SELECT JSON_OBJECT('id',id) FROM orders WHERE tenant_id=${myStr(m.tenantId)} AND order_number LIKE ${myStr(`ERP-${m.id}-%`)} AND notes=${myStr(`ERP run ${m.id}`)};`);
    const ids = [...new Set([...m.orders.map((order) => Number(order.id)), ...tagged.map((row) => Number(row.id))])];
    if (!ids.length) return;
    const idList = ids.map(decimal).join(',');
    const linked = Number(pg(`SELECT count(*) FROM planned_visits WHERE order_id IN (${idList});`));
    if (linked) throw new Error(`${linked} visits still reference run orders; refusing MySQL deletion.`);
    mysql(`DELETE FROM orders WHERE tenant_id=${myStr(m.tenantId)} AND id IN (${idList}) AND order_number LIKE ${myStr(`ERP-${m.id}-%`)} AND notes=${myStr(`ERP run ${m.id}`)};`);
    await visible(`${ids.length} orders deleted`, `SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM orders_cache WHERE tenant_id=${tenant} AND id IN (${idList}))`, started());
  });

  for (const c of m.customerOriginals) await step(`customer #${c.id}`, async () => {
    const current = one<CustomerRow>(`SELECT JSON_OBJECT('id',id,'tenantId',tenant_id,'name',name,'latitude',latitude,'longitude',longitude,'geofenceRadiusMeters',geofence_radius_meters,'zone',zone) FROM customers WHERE id=${decimal(c.id)} AND tenant_id=${myStr(m.tenantId)};`);
    if (!current) { console.log(`Customer #${c.id} already missing.`); return; }
    const original = Number(current.latitude) === Number(c.latitude) && Number(current.longitude) === Number(c.longitude)
      && Number(current.geofenceRadiusMeters) === Number(c.geofenceRadiusMeters) && current.zone === c.zone;
    if (original) { console.log(`Customer #${c.id} already restored.`); return; }
    if (!current.zone?.startsWith(`ERP ${m.id}-`)) throw new Error('Row was changed outside this run; refusing to overwrite it.');
    mysql(`UPDATE customers SET latitude=${c.latitude == null ? 'NULL' : decimal(Number(c.latitude))},longitude=${c.longitude == null ? 'NULL' : decimal(Number(c.longitude))},geofence_radius_meters=${decimal(Number(c.geofenceRadiusMeters))},zone=${myStr(c.zone)} WHERE id=${decimal(c.id)} AND tenant_id=${myStr(m.tenantId)} AND zone=${myStr(current.zone)};`);
    await visible(`customer #${c.id} restored`, `SELECT 1 FROM customers_cache WHERE id=${decimal(c.id)} AND tenant_id=${tenant} AND zone IS NOT DISTINCT FROM ${c.zone == null ? 'NULL' : pgStr(c.zone)} AND latitude IS NOT DISTINCT FROM ${c.latitude == null ? 'NULL' : decimal(Number(c.latitude))} AND longitude IS NOT DISTINCT FROM ${c.longitude == null ? 'NULL' : decimal(Number(c.longitude))} AND geofence_radius_meters=${decimal(Number(c.geofenceRadiusMeters))}`, started());
  });

  await step('edited product', async () => {
    const p = m.productOriginal;
    if (!p) return;
    const current = one<ProductRow>(`SELECT JSON_OBJECT('id',id,'unitPrice',unit_price,'category',category) FROM products WHERE id=${decimal(p.id)} AND tenant_id=${myStr(m.tenantId)};`);
    if (!current) { console.log(`Product #${p.id} already missing.`); return; }
    if (Number(current.unitPrice) === Number(p.unitPrice) && current.category === p.category) { console.log(`Product #${p.id} already restored.`); return; }
    if (current.category !== `ERP ${m.id}`) throw new Error('Row was changed outside this run; refusing to overwrite it.');
    mysql(`UPDATE products SET unit_price=${decimal(Number(p.unitPrice))},category=${myStr(p.category)} WHERE id=${decimal(p.id)} AND tenant_id=${myStr(m.tenantId)} AND category=${myStr(current.category)};`);
    await visible(`product #${p.id} restored`, `SELECT 1 FROM products_cache WHERE id=${decimal(p.id)} AND tenant_id=${tenant} AND category IS NOT DISTINCT FROM ${p.category == null ? 'NULL' : pgStr(p.category)} AND unit_price=${decimal(Number(p.unitPrice))}`, started());
  });

  await step('account', async () => {
    const a = m.accountOriginal;
    if (!a) return;
    const current = one<AccountRow>(`SELECT JSON_OBJECT('id',id,'name',name) FROM accounts WHERE id=${decimal(a.id)} AND tenant_id=${myStr(m.tenantId)};`);
    if (!current) { console.log(`Account #${a.id} already missing.`); return; }
    if (current.name === a.name) { console.log(`Account #${a.id} already restored.`); return; }
    const tags = [`${a.name} - ERP ${m.id}`, `${a.name} · ERP ${m.id}`, `${a.name} ? ERP ${m.id}`];
    if (!tags.includes(current.name)) throw new Error('Row was changed outside this run; refusing to overwrite it.');
    mysql(`UPDATE accounts SET name=${myStr(a.name)} WHERE id=${decimal(a.id)} AND tenant_id=${myStr(m.tenantId)} AND name=${myStr(current.name)};`);
    await visible(`account #${a.id} restored`, `SELECT 1 FROM accounts_cache WHERE id=${decimal(a.id)} AND tenant_id=${tenant} AND name=${pgStr(a.name)}`, started());
  });

  await step('created products', async () => {
    const tagged = rows<{ id: number }>(`SELECT JSON_OBJECT('id',id) FROM products WHERE tenant_id=${myStr(m.tenantId)} AND sku=${myStr(`ERP-${m.id}`)};`);
    const ids = [...new Set([...m.createdProducts, ...tagged.map((row) => Number(row.id))])];
    if (!ids.length) return;
    const idList = ids.map(decimal).join(',');
    mysql(`DELETE FROM products WHERE id IN (${idList}) AND tenant_id=${myStr(m.tenantId)} AND sku=${myStr(`ERP-${m.id}`)};`);
    await visible('run products deleted', `SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM products_cache WHERE tenant_id=${tenant} AND id IN (${idList}))`, started());
  });

  if (failures.length) throw new Error(`Cleanup incomplete for run ${m.id}; manifest retained. Failed steps:\n${failures.join('\n')}`);
  unlinkSync(manifestPath(m.id));
  console.log(`Cleared ERP run ${m.id}.`);
}

function usage(): void {
  console.log('ERP CDC demo: --once [--with-routes --drive] [--pause-connector] | --business-day [--interval 60] | --dry-run --once | --list-runs | --clear <run-id>');
}
async function main(): Promise<void> {
  if (opts.help) return usage();
  if (opts['list-runs']) return listRuns();
  if (opts.clear) return clearRun(load(opts.clear));
  if (opts.once === opts['business-day']) return usage();
  if (opts.drive && !opts['with-routes']) throw new Error('--drive requires --with-routes.');
  if (opts['with-routes'] && !opts.once) throw new Error('--with-routes is supported in --once mode.');
  if (opts['pause-connector'] && !opts.once) throw new Error('--pause-connector is supported in --once mode.');
  const intervalSeconds = Number(opts.interval);
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 1) throw new Error('--interval must be at least 1 second.');
  const id = randomUUID().slice(0, 8);
  if (opts['dry-run']) {
    const story = opts.once
      ? `create three La Paz orders; observe CDC; move customer; edit product/account; cancel unassigned order${opts['with-routes'] ? '; create linked route' : ''}${opts.drive ? '; drive route and verify write-back' : ''}${opts['pause-connector'] ? '; pause/resume connector' : ''}`
      : `stream La Paz orders every ${intervalSeconds}s with periodic cancellations, customer and product edits`;
    console.log(`Dry run ${id}: Business-tier preflight; ${story}. No writes sent.`);
    return;
  }
  const api = new Api(); await api.login();
  const customers = await preflight(api);
  const manifest: RunManifest = { version: 1, id, tenantId: opts.tenant!, createdAt: new Date().toISOString(), orders: [], createdProducts: [], customerOriginals: [], customerRevision: 0 };
  save(manifest);
  console.log(`ERP run ${id}; manifest ${manifestPath(id)}`);
  if (opts.once) await once(api, customers, manifest);
  else await businessDay(customers, manifest, intervalSeconds);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
