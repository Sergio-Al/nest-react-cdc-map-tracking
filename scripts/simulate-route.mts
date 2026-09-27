/**
 * Planned-route driving simulator.
 *
 * Drives a real planned route end to end as if a driver's phone were running
 * Traccar Client: road-following positions (OSRM) are sent to Traccar's OsmAnd
 * port, so the full pipeline runs — Traccar → webhook → Kafka → enrichment →
 * live map / ETA / geofence auto-arrival + auto-departure → history.
 * At each stop it dwells inside the geofence and (by default) completes the
 * visit through the API, the way the driver app would.
 *
 * Timestamps are the real wall clock and driving is real time; only the dwell
 * at each stop is shortened. (Faking time breaks visit timestamps, playback
 * and report ranges — see the design notes in the PR.)
 *
 * Requirements: Node >= 22.18 (runs .mts natively), the Docker stack up
 * (traccar, osrm, kafka, dbs) and tracking-service on :3000. The route is made
 * beforehand in the Route Builder (/routes) and must be scheduled for today (UTC).
 *
 * Usage:
 *   node scripts/simulate-route.mts --list                     # today's routes
 *   node scripts/simulate-route.mts --route <uuid> --dry-run   # preview, sends nothing
 *   node scripts/simulate-route.mts --route <uuid>             # drive it
 *   node scripts/simulate-route.mts --route <a> --route <b>    # several drivers at once
 *   node scripts/simulate-route.mts --backfill 14              # seed 14 past workdays for Reports
 *   node scripts/simulate-route.mts --clear-backfill           # remove everything --backfill wrote
 *
 * Backfill mode generates COMPLETED past workdays (Mon–Sat) for every driver with
 * a paired device: routes + visits in PostgreSQL, positions + visit completions
 * in TimescaleDB, then refreshes driver_daily_stats — so History and Reports have
 * real-looking data. It uses the same OSRM streets and driving model as live mode
 * but writes directly (via `docker exec … psql`), because the live pipeline only
 * auto-arrives today's visits. Days where a driver already has a route are skipped.
 * Everything it writes is tagged, and --clear-backfill removes exactly that.
 *
 * Options (defaults in brackets):
 *   --api <url>        tracking-service base URL        [http://localhost:3000]
 *   --osmand <url>     Traccar OsmAnd endpoint          [http://localhost:5055]
 *   --osrm <url>       OSRM base URL                    [http://localhost:5003]
 *   --email/--password/--tenant  admin login   [admin@tenant1.com / admin123 / tenant-1]
 *   --interval <s>     seconds between GPS fixes        [5]
 *   --dwell <s>        seconds parked at each stop      [90]
 *   --cruise <km/h>    typical cruising speed           [32]
 *   --start <lat,lon>  starting point (default: route depot, else ~1.2 km from stop 1)
 *   --no-complete      leave visits arrived; complete them yourself in the UI
 *   --force            run despite pre-flight conflicts (other open visits etc.)
 *   --allow-manual-arrival  if auto-arrival doesn't fire, mark arrived via the API
 *                      and keep going (default: abort — the pipeline is broken)
 *   --dry-run          print the plan and exit; sends no GPS and changes nothing
 *   --stops <min-max>  stops per backfilled route        [4-7]
 */
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// ── CLI ──────────────────────────────────────────────────────

const { values: opts } = parseArgs({
  options: {
    route: { type: 'string', multiple: true },
    list: { type: 'boolean', default: false },
    api: { type: 'string', default: 'http://localhost:3000' },
    osmand: { type: 'string', default: 'http://localhost:5055' },
    osrm: { type: 'string', default: 'http://localhost:5003' },
    email: { type: 'string', default: 'admin@tenant1.com' },
    password: { type: 'string', default: 'admin123' },
    tenant: { type: 'string', default: 'tenant-1' },
    interval: { type: 'string', default: '5' },
    dwell: { type: 'string', default: '90' },
    cruise: { type: 'string', default: '32' },
    start: { type: 'string' },
    'no-complete': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    'allow-manual-arrival': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    backfill: { type: 'string' },
    'clear-backfill': { type: 'boolean', default: false },
    stops: { type: 'string', default: '4-7' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

// OsmAnd timestamps are whole seconds and history dedupes on (time, driver).
const INTERVAL_S = Math.max(1, positiveNumber(opts.interval!, '--interval'));
const DWELL_S = positiveNumber(opts.dwell!, '--dwell');
const CRUISE_KMH = positiveNumber(opts.cruise!, '--cruise');
const API = opts.api!.replace(/\/$/, '') + '/api';

const ACCEL_MS2 = 1.0; // gentle city acceleration/braking
const MIN_MOVING_KMH = 6;
const GPS_JITTER_M = 3;
// Backend auto-departure needs 3 fixes beyond radius + 50 m; the exit leg must
// comfortably clear that for the last stop's fence.
const DEPARTURE_MARGIN_M = 50;
const OPEN_ROUTE_EXIT_EXTRA_M = 450;
const ARRIVAL_TIMEOUT_S = 30;
const TERMINAL = ['completed', 'skipped', 'failed', 'cancelled'];
const ARRIVABLE = ['pending', 'en_route'];

let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(130);
  stopping = true;
  console.log('\n⏹  Stopping after the current fix (Ctrl-C again to quit now). Unfinished visits are left as-is.');
});

// ── Types (only the fields we use) ───────────────────────────

type Visit = {
  id: string;
  customerId: number;
  sequenceNumber: number;
  status: string;
  scheduledDate: string;
  routeId: string;
  arrivedAt: string | null;
  departedAt: string | null;
  completedAt: string | null;
};
type Route = {
  id: string;
  driverId: string;
  scheduledDate: string;
  status: string;
  depotLat: number | null;
  depotLon: number | null;
  returnToDepot: boolean;
  visits?: Visit[];
};
type Driver = { id: string; name: string; deviceId: string | null };
type Customer = {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number;
};
type LatLon = { lat: number; lon: number };
type Leg = { to: string; coords: LatLon[]; cum: number[]; meters: number; visit?: Visit; customer?: Customer };
type Plan = { route: Route; driver: Driver; start: LatLon; legs: Leg[] };

// ── API client (auto-refreshes the 15-min access token) ──────

class Api {
  private accessToken = '';
  private refreshToken = '';

  async login(): Promise<void> {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: opts.email, password: opts.password, tenantId: opts.tenant }),
    });
    if (!res.ok) throw new Error(`Login failed (${res.status}): ${await res.text()}`);
    this.setTokens(await res.json());
  }

  private setTokens(body: { accessToken: string; refreshToken: string }): void {
    this.accessToken = body.accessToken;
    this.refreshToken = body.refreshToken;
  }

  private async refresh(): Promise<void> {
    const res = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
    if (res.ok) this.setTokens(await res.json());
    else await this.login();
  }

  async request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !retried) {
      await this.refresh();
      return this.request<T>(method, path, body, true);
    }
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }
}

// ── Geo helpers ──────────────────────────────────────────────

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

function distanceM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearingDeg(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Offset a point by up to `meters` in a random direction (GPS noise). */
function jitter(p: LatLon, meters: number): LatLon {
  const d = Math.random() * meters;
  const theta = Math.random() * 2 * Math.PI;
  return {
    lat: p.lat + (d * Math.cos(theta)) / 111320,
    lon: p.lon + (d * Math.sin(theta)) / (111320 * Math.cos(rad(p.lat))),
  };
}

/** Point + heading at `s` meters along a polyline with cumulative distances `cum`. */
function pointAlong(coords: LatLon[], cum: number[], s: number): { p: LatLon; heading: number } {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const a = coords[i - 1];
  const b = coords[i];
  const seg = cum[i] - cum[i - 1];
  const t = seg > 0 ? Math.min(1, Math.max(0, (s - cum[i - 1]) / seg)) : 1;
  return {
    p: { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t },
    heading: bearingDeg(a, b),
  };
}

function cumulative(coords: LatLon[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + distanceM(coords[i - 1], coords[i]));
  return cum;
}

/** Truncate a polyline to its first `maxM` meters. */
function truncate(coords: LatLon[], cum: number[], maxM: number): LatLon[] {
  const out: LatLon[] = [coords[0]];
  for (let i = 1; i < coords.length && cum[i - 1] < maxM; i++) {
    out.push(cum[i] <= maxM ? coords[i] : pointAlong(coords, cum, maxM).p);
  }
  return out;
}

// ── OSRM + OsmAnd ────────────────────────────────────────────

async function osrmLeg(from: LatLon, to: LatLon): Promise<LatLon[]> {
  const url = `${opts.osrm}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status} for ${url}`);
  const body = (await res.json()) as { code: string; routes?: { geometry: { coordinates: [number, number][] } }[] };
  if (body.code !== 'Ok' || !body.routes?.length) throw new Error(`OSRM returned ${body.code} for ${url}`);
  const coords = body.routes[0].geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
  // OSRM snaps to the road; finish exactly at the target so the fence is entered.
  return [from, ...coords, to];
}

async function sendFix(deviceId: string, p: LatLon, speedKmh: number, heading: number): Promise<void> {
  const q = new URLSearchParams({
    id: deviceId,
    lat: p.lat.toFixed(6),
    lon: p.lon.toFixed(6),
    timestamp: String(Math.floor(Date.now() / 1000)),
    speed: (speedKmh / 1.852).toFixed(1), // OsmAnd speed is in knots
    bearing: heading.toFixed(0),
    altitude: '3640',
    accuracy: '5',
  });
  const res = await fetch(`${opts.osmand}/?${q}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Traccar OsmAnd rejected fix (${res.status}) — is device ${deviceId} registered in Traccar?`);
}

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

// ── Pre-flight + planning ────────────────────────────────────

const todayUtc = () => new Date().toISOString().split('T')[0];

async function buildPlan(api: Api, routeId: string, customers: Map<number, Customer>): Promise<Plan> {
  const route = await api.get<Route>(`/routes/${routeId}`);
  const driver = await api.get<Driver>(`/drivers/${route.driverId}`);
  const problems: string[] = [];

  if (!driver.deviceId) throw new Error(`Driver ${driver.name} has no device paired (Drivers page → pair a device).`);
  if (route.status === 'completed' || route.status === 'cancelled') {
    throw new Error(`Route is already ${route.status}.`);
  }
  // Backend geofence logic only considers visits scheduled today-or-later in UTC.
  if (route.scheduledDate < todayUtc()) {
    problems.push(
      `Route is scheduled ${route.scheduledDate} but today is ${todayUtc()} in UTC — auto-arrival ` +
        `ignores it. (After 20:00 in La Paz the UTC date is already tomorrow.)`,
    );
  }

  // customer_id is BIGINT — pg returns it as a string.
  for (const v of route.visits ?? []) v.customerId = Number(v.customerId);
  const visits = (route.visits ?? [])
    .filter((v) => !TERMINAL.includes(v.status))
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  if (visits.length === 0) throw new Error('Route has no unfinished visits.');

  for (const v of visits) {
    const c = customers.get(v.customerId);
    if (!c || c.latitude == null || c.longitude == null) {
      throw new Error(`Visit #${v.sequenceNumber} customer ${v.customerId} has no coordinates.`);
    }
  }

  // Auto-arrival targets the driver's lowest-sequence open visit across ALL routes
  // from today on — another route's open visit would hijack it.
  const allVisits = await api.get<Visit[]>(`/visits/driver/${driver.id}`);
  const hijackers = allVisits.filter(
    (v) =>
      v.routeId !== route.id &&
      ARRIVABLE.includes(v.status) &&
      v.scheduledDate >= todayUtc() &&
      v.sequenceNumber <= visits[visits.length - 1].sequenceNumber,
  );
  const parkedElsewhere = allVisits.filter(
    (v) => v.routeId !== route.id && v.status === 'in_progress',
  );
  if (parkedElsewhere.length) {
    problems.push(
      `${driver.name} has ${parkedElsewhere.length} in-progress visit(s) on other routes; ` +
        `the backend would keep targeting those. Complete them first.`,
    );
  }
  if (hijackers.length) {
    problems.push(
      `${driver.name} has ${hijackers.length} open visit(s) on other routes that would steal ` +
        `auto-arrival (routes: ${[...new Set(hijackers.map((v) => v.routeId))].join(', ')}). ` +
        `Cancel/complete them first.`,
    );
  }

  if (problems.length) {
    const msg = problems.map((p) => `  • ${p}`).join('\n');
    if (!opts.force) throw new Error(`Pre-flight failed:\n${msg}\n  (use --force to run anyway)`);
    console.warn(`⚠️  Pre-flight warnings (continuing due to --force):\n${msg}`);
  }

  // Start: --start, else pinned depot, else ~1.2 km north of the first stop.
  const first = customers.get(visits[0].customerId)!;
  let start: LatLon;
  if (opts.start) {
    const [lat, lon] = opts.start.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('--start must be "lat,lon"');
    start = { lat, lon };
  } else if (route.depotLat != null && route.depotLon != null) {
    start = { lat: route.depotLat, lon: route.depotLon };
  } else {
    start = { lat: first.latitude! + 0.011, lon: first.longitude! };
  }

  const legs: Leg[] = [];
  let from = start;
  for (const v of visits) {
    const c = customers.get(v.customerId)!;
    const to = { lat: c.latitude!, lon: c.longitude! };
    const coords = await osrmLeg(from, to);
    const cum = cumulative(coords);
    legs.push({ to: c.name, coords, cum, meters: cum[cum.length - 1], visit: v, customer: c });
    from = to;
  }

  // Final leg drives off the last stop so its auto-departure fires: back to the
  // depot for closed routes, otherwise just the first stretch toward the start.
  const hasDepot = route.depotLat != null && route.depotLon != null;
  const closed = hasDepot && route.returnToDepot;
  let coords = await osrmLeg(from, start);
  let cum = cumulative(coords);
  const lastRadius = customers.get(visits[visits.length - 1].customerId)!.geofenceRadiusMeters;
  const exitM = lastRadius + DEPARTURE_MARGIN_M + OPEN_ROUTE_EXIT_EXTRA_M;
  if (!closed && cum[cum.length - 1] > exitM) {
    coords = truncate(coords, cum, exitM);
    cum = cumulative(coords);
  }
  legs.push({ to: closed ? 'depot' : 'leave last stop', coords, cum, meters: cum[cum.length - 1] });

  // A stop whose next stop is within its departure distance never auto-departs.
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1];
    const gap = distanceM(legs[i].coords[0], legs[i].coords[legs[i].coords.length - 1]);
    if (prev.customer && gap < prev.customer.geofenceRadiusMeters + DEPARTURE_MARGIN_M) {
      console.warn(`⚠️  ${prev.to} → ${legs[i].to} is only ${Math.round(gap)} m — ${prev.to} may not get a departure time.`);
    }
  }

  return { route, driver, start, legs };
}

function printPlan(plan: Plan): void {
  const cruiseMs = CRUISE_KMH / 3.6;
  let totalM = 0;
  console.log(`\n🚚 ${plan.driver.name} (${plan.driver.deviceId}) — route ${plan.route.id} [${plan.route.status}]`);
  console.log(`   start ${plan.start.lat.toFixed(5)},${plan.start.lon.toFixed(5)}`);
  plan.legs.forEach((leg, i) => {
    totalM += leg.meters;
    const label = leg.visit ? `#${leg.visit.sequenceNumber} ${leg.to} (${leg.visit.status}, fence ${leg.customer!.geofenceRadiusMeters} m)` : leg.to;
    console.log(`   ${String(i + 1).padStart(2)}. ${(leg.meters / 1000).toFixed(2).padStart(6)} km → ${label}`);
  });
  const stops = plan.legs.filter((l) => l.visit).length;
  const minutes = totalM / cruiseMs / 60 * 1.15 + (stops * DWELL_S) / 60; // +15% for accel/braking
  console.log(`   total ${(totalM / 1000).toFixed(1)} km, ${stops} stops, ≈ ${Math.round(minutes)} min at ${CRUISE_KMH} km/h + ${DWELL_S}s dwell`);
}

// ── Driving model (shared by live + backfill) ────────────────

type Sample = { p: LatLon; heading: number; kmh: number };

/**
 * One sample per `intervalS` along a leg: accelerate from rest, brake to walking
 * pace before the stop, ±12% traffic noise, and an occasional red light.
 */
function* motion(
  leg: Pick<Leg, 'coords' | 'cum' | 'meters'>,
  intervalS: number,
  cruiseKmh = CRUISE_KMH,
  /** Optional stretch driven faster (backfill speeding), in meters along the leg. */
  boost?: { fromM: number; toM: number; kmh: number },
): Generator<Sample> {
  const cruiseMs = cruiseKmh / 3.6;
  let s = 0;
  let v = 0;
  while (s < leg.meters) {
    const remaining = leg.meters - s;
    const boosted = boost && s >= boost.fromM && s <= boost.toM;
    const target = boosted ? (boost.kmh / 3.6) * (0.95 + Math.random() * 0.1) : cruiseMs * (0.88 + Math.random() * 0.24);
    const brakeCap = Math.sqrt(2 * ACCEL_MS2 * remaining) + MIN_MOVING_KMH / 3.6;
    v = Math.min(target, v + ACCEL_MS2 * intervalS, brakeCap);
    if (Math.random() < 0.04) v = 0;
    s = Math.min(leg.meters, s + v * intervalS);
    const { p, heading } = pointAlong(leg.coords, leg.cum, s);
    yield { p, heading, kmh: v * 3.6 };
  }
}

// ── Driving ──────────────────────────────────────────────────

class Simulator {
  private readonly log: (msg: string) => void;
  private readonly api: Api;
  private readonly plan: Plan;
  private fixes = 0;

  constructor(api: Api, plan: Plan, prefix: string) {
    this.api = api;
    this.plan = plan;
    this.log = (msg) => console.log(`${new Date().toLocaleTimeString()} ${prefix} ${msg}`);
  }

  private async fix(p: LatLon, speedKmh: number, heading: number): Promise<void> {
    await sendFix(this.plan.driver.deviceId!, jitter(p, GPS_JITTER_M), speedKmh, heading);
    this.fixes++;
    if (this.fixes === 2) void this.checkPipeline();
    await sleep(INTERVAL_S);
  }

  /** After the first fixes, confirm the backend actually saw them. */
  private async checkPipeline(): Promise<void> {
    await sleep(INTERVAL_S);
    try {
      const pos = await this.api.get<{ updatedAt?: string } | null>(`/drivers/${this.plan.driver.id}/position`);
      const fresh = pos?.updatedAt && Date.now() - new Date(pos.updatedAt).getTime() < 60_000;
      if (fresh) this.log('✅ positions are reaching the backend (live map should show the driver)');
      else this.log('⚠️  no fresh position in the backend yet — check Traccar device registration and tracking-service logs');
    } catch (err) {
      this.log(`⚠️  could not verify the pipeline: ${(err as Error).message}`);
    }
  }

  private async drive(leg: Leg): Promise<void> {
    for (const { p, heading, kmh } of motion(leg, INTERVAL_S)) {
      if (stopping) return;
      await this.fix(p, kmh, heading);
    }
  }

  private async visit(leg: Leg): Promise<void> {
    const visit = leg.visit!;
    const at = { lat: leg.customer!.latitude!, lon: leg.customer!.longitude! };
    this.log(`📍 at ${leg.to} — dwelling ${DWELL_S}s`);

    // Parked fixes right at the customer: the first one should trigger auto-arrival.
    const parkedFixes = Math.max(3, Math.round(DWELL_S / INTERVAL_S));
    for (let i = 0; i < 2 && !stopping; i++) await this.fix(at, 0, 0);
    if (stopping) return;

    // Keep sending parked fixes while waiting for the pipeline to auto-arrive.
    let current = await this.api.get<Visit>(`/visits/${visit.id}`);
    let parked = 2;
    const deadline = Date.now() + ARRIVAL_TIMEOUT_S * 1000;
    while (ARRIVABLE.includes(current.status) && Date.now() < deadline && !stopping) {
      await this.fix(at, 0, 0);
      parked++;
      current = await this.api.get<Visit>(`/visits/${visit.id}`);
    }
    if (stopping) return;
    if (ARRIVABLE.includes(current.status)) {
      const why =
        `auto-arrival did not fire at ${leg.to} within ${ARRIVAL_TIMEOUT_S}s (status ${current.status}). ` +
        `Check Traccar forwarding, the enrichment logs, and that the route is scheduled for today (UTC).`;
      if (!opts['allow-manual-arrival']) throw new Error(`${why} Re-run with --allow-manual-arrival to push through.`);
      this.log(`⚠️  ${why} Marking arrived via the API (--allow-manual-arrival).`);
      current = await this.api.patch<Visit>(`/visits/${visit.id}/status`, { status: 'arrived' });
    } else {
      this.log(`✅ auto-arrival fired (status ${current.status})`);
    }
    if (!opts['no-complete'] && current.status === 'arrived') {
      await this.api.patch(`/visits/${visit.id}/status`, { status: 'in_progress' });
    }

    for (let i = parked; i < parkedFixes && !stopping; i++) await this.fix(at, 0, 0);
    if (stopping) return;

    if (!opts['no-complete']) {
      await this.api.patch(`/visits/${visit.id}/status`, {
        status: 'completed',
        notes: 'Completed by route simulator',
      });
      this.log(`✔️  completed ${leg.to}`);
    }
  }

  async run(): Promise<void> {
    const { route } = this.plan;
    if (route.status === 'planned') {
      await this.api.patch(`/routes/${route.id}`, { status: 'in_progress' });
      this.log('▶️  route started (in_progress)');
    }
    for (const leg of this.plan.legs) {
      if (stopping) break;
      this.log(`🚗 driving ${(leg.meters / 1000).toFixed(2)} km → ${leg.to}`);
      await this.drive(leg);
      if (leg.visit && !stopping) await this.visit(leg);
    }
    await this.summary();
    if (!stopping) refreshDailyStatsQuietly(this.log);
  }

  private async summary(): Promise<void> {
    const fresh = await this.api.get<Route>(`/routes/${this.plan.route.id}`);
    const t = (d: string | null) => (d ? new Date(d).toLocaleTimeString() : '—');
    this.log(`🏁 ${stopping ? 'stopped' : 'finished'} — route ${fresh.status}, ${this.fixes} fixes sent`);
    for (const v of (fresh.visits ?? []).sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
      console.log(
        `     #${v.sequenceNumber} ${v.status.padEnd(11)} arrived ${t(v.arrivedAt)}  completed ${t(v.completedAt)}  departed ${t(v.departedAt)}`,
      );
    }
    const undeparted = (fresh.visits ?? []).filter((v) => v.arrivedAt && !v.departedAt);
    if (undeparted.length && !stopping) {
      this.log(`⚠️  ${undeparted.length} stop(s) have no departure time — auto-departure didn't fire (see enrichment logs).`);
    }
  }
}

// ── Direct DB access (docker exec psql) ──────────────────────

function psql(container: string, user: string, db: string, sql: string): string {
  const r = spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A'],
    { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  if (r.status !== 0) throw new Error(`psql on ${container} failed: ${r.stderr || r.error?.message}`);
  return r.stdout;
}
const cacheDb = (sql: string) => psql('cache-db', 'tracking', 'tracking_cache', sql);
const historyDb = (sql: string) => psql('timescale', 'timescale', 'tracking_history', sql);

/** SQL literal. */
function lit(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${v.replace(/'/g, "''")}'`;
}

function insertSql(table: string, cols: string[], rows: unknown[][], chunk = 1000): string {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const values = rows
      .slice(i, i + chunk)
      .map((r) => `(${r.map((v) => lit(v as never)).join(',')})`)
      .join(',\n');
    out.push(`INSERT INTO ${table} (${cols.join(',')}) VALUES\n${values};`);
  }
  return out.join('\n');
}

/**
 * driver_daily_stats buckets by La Paz civil day, and a refresh only recomputes
 * buckets that lie ENTIRELY inside the window — so the (UTC) end must be at least
 * two dates past a local day for that day to be included.
 */
function refreshDailyStats(fromYmd: string, toYmdExclusive: string): void {
  historyDb(`CALL refresh_continuous_aggregate('driver_daily_stats', '${fromYmd}', '${toYmdExclusive}');`);
}

/** After a live run: make today's run show in Reports now, not after the hourly policy. */
function refreshDailyStatsQuietly(log: (msg: string) => void): void {
  try {
    refreshDailyStats(addDays(localYmd(new Date()), -1), addDays(localYmd(new Date()), 2));
    log('📊 driver_daily_stats refreshed — Reports include this run');
  } catch (err) {
    log(`⚠️  could not refresh driver_daily_stats (${(err as Error).message.split('\n')[0]})`);
  }
}

// ── Backfill (past workdays for History + Reports) ───────────

const BACKFILL_MARK = 'Simulated history (backfill)';
// Bolivia has no DST; matches tracking-service DEFAULT_TZ (America/La_Paz).
const LOCAL_OFFSET = '-04:00';
const LOCAL_OFFSET_MS = -4 * 3600_000;
const BACKFILL_DRIVE_INTERVAL_S = 10;
const BACKFILL_PARKED_INTERVAL_S = 30;

const localYmd = (d: Date) => new Date(d.getTime() + LOCAL_OFFSET_MS).toISOString().slice(0, 10);
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
/** Short hops crawl through side streets; long legs get avenue speeds. */
const legCruise = (meters: number) => CRUISE_KMH * (meters > 2500 ? rand(1.05, 1.5) : rand(0.75, 1.1));
const hhmm = (d: Date) => new Date(d.getTime() + LOCAL_OFFSET_MS).toISOString().slice(11, 16);

type DayResult = { routes: unknown[][]; visits: unknown[][]; positions: unknown[][]; completions: unknown[][]; km: number };

async function simulateDay(
  tenantId: string,
  driver: Driver,
  ymd: string,
  depot: LatLon,
  stops: Customer[],
  legCache: Map<string, LatLon[]>,
): Promise<DayResult> {
  const routeId = randomUUID();
  const out: DayResult = { routes: [], visits: [], positions: [], completions: [], km: 0 };
  let clock = new Date(`${ymd}T08:00:00${LOCAL_OFFSET}`).getTime() + rand(0, 75) * 60_000;
  const routeCreated = new Date(clock - 16 * 3600_000).toISOString();
  let planned = clock; // idealised plan: cruise speed + 8-min stops → time windows
  let completed = 0;
  let from = depot;

  const leg = async (to: LatLon): Promise<Pick<Leg, 'coords' | 'cum' | 'meters'>> => {
    const key = `${from.lat},${from.lon};${to.lat},${to.lon}`;
    let coords = legCache.get(key);
    if (!coords) legCache.set(key, (coords = await osrmLeg(from, to)));
    const cum = cumulative(coords);
    return { coords, cum, meters: cum[cum.length - 1] };
  };
  const position = (s: Sample, visitId: string | null, customer: Customer | null) => {
    const target = customer ? { lat: customer.latitude!, lon: customer.longitude! } : null;
    const dist = target ? distanceM(s.p, target) : null;
    const p = jitter(s.p, GPS_JITTER_M);
    out.positions.push([
      new Date(clock).toISOString(), driver.id, tenantId, +p.lat.toFixed(6), +p.lon.toFixed(6),
      +s.kmh.toFixed(1), Math.round(s.heading), 3640, 5, routeId, visitId, customer?.name ?? null,
      dist != null ? Math.round(dist) : null,
      dist != null && s.kmh > 1 ? Math.round(dist / (s.kmh / 3.6)) : null,
    ]);
  };

  /**
   * Drive a leg on the synthetic clock. Some legs hit a traffic jam (5–9 min
   * stopped → an "idle" event); some long avenue legs include a short speeding
   * stretch (→ a "speeding" event), so the activity feed has the full range.
   */
  const driveLeg = (l: Pick<Leg, 'coords' | 'cum' | 'meters'>, emit: (s: Sample) => void) => {
    const fromM = rand(0.3, 0.6) * l.meters;
    const boost = l.meters > 2500 && Math.random() < 0.15 ? { fromM, toM: fromM + rand(250, 450), kmh: rand(64, 78) } : undefined;
    const samples = [...motion(l, BACKFILL_DRIVE_INTERVAL_S, legCruise(l.meters), boost)];
    const jamAt = samples.length > 10 && Math.random() < 0.2 ? randInt(3, samples.length - 4) : -1;
    samples.forEach((sample, k) => {
      clock += BACKFILL_DRIVE_INTERVAL_S * 1000;
      emit(sample);
      if (k === jamAt) {
        const until = clock + rand(5.5, 9) * 60_000;
        while (clock < until) {
          clock += BACKFILL_PARKED_INTERVAL_S * 1000;
          emit({ ...sample, kmh: 0 });
        }
      }
    });
  };

  for (const [i, c] of stops.entries()) {
    const visitId = randomUUID();
    const to = { lat: c.latitude!, lon: c.longitude! };
    const l = await leg(to);
    out.km += l.meters / 1000;
    planned += (l.meters / (CRUISE_KMH / 3.6)) * 1000;
    const windowEnd = new Date(planned + rand(10, 60) * 60_000);
    const windowStart = new Date(planned - 60 * 60_000);
    planned += 8 * 60_000;

    driveLeg(l, (sample) => position(sample, visitId, c));
    from = to;

    // Outcome: most delivered; a few customers closed (skipped) or refused (failed).
    const r = Math.random();
    const status = r < 0.04 ? 'failed' : r < 0.08 ? 'skipped' : 'completed';
    const arrivedAt = new Date(clock);
    const dwellMin = status === 'completed' ? rand(4, 14) : rand(1.5, 4);
    const leaveAt = clock + dwellMin * 60_000;
    while (clock < leaveAt) {
      clock += BACKFILL_PARKED_INTERVAL_S * 1000;
      position({ p: to, heading: 0, kmh: 0 }, visitId, c);
    }
    const doneAt = new Date(clock);
    const departedAt = new Date(clock + 30_000);
    if (status === 'completed') completed++;
    const onTime = doneAt.getTime() <= windowEnd.getTime();

    out.visits.push([
      visitId, tenantId, routeId, driver.id, c.id, i + 1, 'delivery', ymd,
      hhmm(windowStart), hhmm(windowEnd), status, arrivedAt.toISOString(), departedAt.toISOString(),
      status === 'completed' ? doneAt.toISOString() : null, BACKFILL_MARK, routeCreated, departedAt.toISOString(),
    ]);
    out.completions.push([
      doneAt.toISOString(), visitId, tenantId, driver.id, c.id, routeId, 'delivery', status,
      arrivedAt.toISOString(), status === 'completed' ? doneAt.toISOString() : null,
      status === 'completed' ? Math.round((doneAt.getTime() - arrivedAt.getTime()) / 1000) : null, onTime,
    ]);
  }

  // Back to the depot.
  const home = await leg(depot);
  out.km += home.meters / 1000;
  driveLeg(home, (sample) => position(sample, null, null));

  out.routes.push([
    routeId, tenantId, driver.id, ymd, 'completed', stops.length, completed,
    Math.round(out.km * 1000), Math.round((planned - (new Date(`${ymd}T08:00:00${LOCAL_OFFSET}`).getTime())) / 1000),
    depot.lat, depot.lon, 'Depósito (simulado)', true, routeCreated, new Date(clock).toISOString(),
  ]);
  return out;
}

/** Nearest-neighbour ordering from the depot — what a dispatcher's route roughly looks like. */
function orderStops(depot: LatLon, stops: Customer[]): Customer[] {
  const left = [...stops];
  const ordered: Customer[] = [];
  let at = depot;
  while (left.length) {
    left.sort((a, b) => distanceM(at, { lat: a.latitude!, lon: a.longitude! }) - distanceM(at, { lat: b.latitude!, lon: b.longitude! }));
    const next = left.shift()!;
    ordered.push(next);
    at = { lat: next.latitude!, lon: next.longitude! };
  }
  return ordered;
}

async function backfill(api: Api, days: number): Promise<void> {
  const [minStops, maxStops] = opts.stops!.split('-').map(Number);
  if (!(minStops >= 1 && maxStops >= minStops)) throw new Error('--stops must look like 4-7');

  const drivers = (await api.get<(Driver & { status: string })[]>('/drivers')).filter(
    (d) => d.deviceId && d.status !== 'inactive',
  );
  if (!drivers.length) throw new Error('No active drivers with a paired device.');

  // Customers with coordinates, dropping outliers far from the tenant's main city.
  const all = (await api.get<Customer[]>('/customers'))
    .map((c) => ({ ...c, id: Number(c.id) }))
    .filter((c) => c.latitude != null && c.longitude != null);
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const center = { lat: median(all.map((c) => c.latitude!)), lon: median(all.map((c) => c.longitude!)) };
  const customers = all.filter((c) => distanceM(center, { lat: c.latitude!, lon: c.longitude! }) < 25_000);
  if (customers.length < minStops) throw new Error(`Only ${customers.length} customers with coordinates near the city.`);

  let depot = center;
  if (opts.start) {
    const [lat, lon] = opts.start.split(',').map(Number);
    depot = { lat, lon };
  }

  const today = localYmd(new Date());
  const firstDay = addDays(today, -days);
  const lastDay = addDays(today, -1);
  const existing = await api.get<Route[]>(`/routes?from=${firstDay}&to=${lastDay}`);
  const taken = new Set(existing.map((r) => `${r.driverId}|${r.scheduledDate}`));

  const all_: DayResult = { routes: [], visits: [], positions: [], completions: [], km: 0 };
  const legCache = new Map<string, LatLon[]>();
  let skipped = 0;
  for (let d = days; d >= 1; d--) {
    const ymd = addDays(today, -d);
    if (new Date(`${ymd}T12:00:00Z`).getUTCDay() === 0) continue; // Sundays off
    for (const driver of drivers) {
      if (taken.has(`${driver.id}|${ymd}`)) {
        skipped++;
        continue;
      }
      const pool = [...customers].sort(() => Math.random() - 0.5).slice(0, randInt(minStops, Math.min(maxStops, customers.length)));
      const day = await simulateDay(opts.tenant!, driver, ymd, depot, orderStops(depot, pool), legCache);
      for (const k of ['routes', 'visits', 'positions', 'completions'] as const) all_[k].push(...day[k]);
      all_.km += day.km;
      process.stdout.write('.');
    }
  }
  console.log(
    `\n${all_.routes.length} routes, ${all_.visits.length} visits, ${all_.positions.length} positions, ` +
      `${Math.round(all_.km)} km over ${firstDay}…${lastDay} for ${drivers.map((d) => d.name).join(', ')}` +
      (skipped ? ` (${skipped} driver-days skipped: route already exists)` : ''),
  );
  if (opts['dry-run']) {
    console.log('(dry run — nothing written)');
    return;
  }
  if (!all_.routes.length) return;

  cacheDb(
    'BEGIN;\n' +
      insertSql('routes', ['id', 'tenant_id', 'driver_id', 'scheduled_date', 'status', 'total_stops', 'completed_stops',
        'total_distance_meters', 'total_estimated_seconds', 'depot_lat', 'depot_lon', 'depot_label', 'return_to_depot',
        'created_at', 'updated_at'], all_.routes) +
      '\n' +
      insertSql('planned_visits', ['id', 'tenant_id', 'route_id', 'driver_id', 'customer_id', 'sequence_number',
        'visit_type', 'scheduled_date', 'time_window_start', 'time_window_end', 'status', 'arrived_at', 'departed_at',
        'completed_at', 'notes', 'created_at', 'updated_at'], all_.visits) +
      '\nCOMMIT;',
  );
  historyDb(
    'BEGIN;\n' +
      insertSql('enriched_positions', ['time', 'driver_id', 'tenant_id', 'latitude', 'longitude', 'speed', 'heading',
        'altitude', 'accuracy', 'route_id', 'visit_id', 'customer_name', 'distance_to_next_m', 'eta_to_next_sec'],
        all_.positions) +
      '\n' +
      insertSql('visit_completions', ['time', 'visit_id', 'tenant_id', 'driver_id', 'customer_id', 'route_id',
        'visit_type', 'status', 'arrived_at', 'completed_at', 'duration_sec', 'on_time'], all_.completions) +
      '\nCOMMIT;',
  );
  refreshDailyStats(addDays(firstDay, -1), addDays(today, 2));
  console.log('✅ written to PostgreSQL + TimescaleDB, driver_daily_stats refreshed. Open /reports and /history.');
}

function clearBackfill(): void {
  const ids = cacheDb(`SELECT DISTINCT route_id FROM planned_visits WHERE notes = ${lit(BACKFILL_MARK)};`)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!ids.length) {
    console.log('No backfilled data found.');
    return;
  }
  const list = ids.map((id) => lit(id)).join(',');
  historyDb(
    `DELETE FROM enriched_positions WHERE route_id IN (${list});\n` +
      `DELETE FROM visit_completions WHERE route_id IN (${list});`,
  );
  cacheDb(
    `BEGIN;\nDELETE FROM planned_visits WHERE route_id IN (${list});\n` +
      `DELETE FROM routes WHERE id IN (${list});\nCOMMIT;`,
  );
  const today = localYmd(new Date());
  refreshDailyStats(addDays(today, -400), addDays(today, 2));
  console.log(`🧹 removed ${ids.length} backfilled routes (and their visits, positions, completions).`);
}

// ── Main ─────────────────────────────────────────────────────

function positiveNumber(raw: string, name: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
}

async function listRoutes(api: Api): Promise<void> {
  const today = todayUtc();
  const [routes, drivers] = await Promise.all([
    api.get<Route[]>(`/routes?from=${today}&to=${today}`),
    api.get<Driver[]>('/drivers'),
  ]);
  const byId = new Map(drivers.map((d) => [d.id, d]));
  console.log(`Routes scheduled ${today} (UTC):`);
  if (!routes.length) console.log('  (none — create one in the Route Builder at /routes for today)');
  for (const r of routes) {
    const d = byId.get(r.driverId);
    const open = (r.visits ?? []).filter((v) => !TERMINAL.includes(v.status)).length;
    console.log(`  ${r.id}  ${r.status.padEnd(11)} ${open}/${r.visits?.length ?? 0} open  ${d?.name ?? r.driverId} (${d?.deviceId ?? 'no device'})`);
  }
}

async function main(): Promise<void> {
  if (opts['clear-backfill']) return clearBackfill();
  if (opts.help || (!opts.list && !opts.route?.length && !opts.backfill)) {
    console.log('Usage: node scripts/simulate-route.mts --list | --route <uuid> [--route <uuid>…] [--dry-run] [--dwell 90] [--interval 5] [--cruise 32] [--no-complete] [--force]');
    console.log('       node scripts/simulate-route.mts --backfill <days> [--stops 4-7] [--dry-run] | --clear-backfill');
    return;
  }

  const api = new Api();
  await api.login();
  if (opts.list) return listRoutes(api);
  if (opts.backfill) return backfill(api, positiveNumber(opts.backfill, '--backfill'));

  const customers = new Map(
    (await api.get<Customer[]>('/customers')).map((c) => [Number(c.id), { ...c, id: Number(c.id) }]),
  );
  const plans: Plan[] = [];
  for (const id of new Set(opts.route)) plans.push(await buildPlan(api, id, customers));

  const devices = plans.map((p) => p.driver.deviceId);
  if (new Set(devices).size !== devices.length) throw new Error('Two routes share the same driver/device.');

  plans.forEach(printPlan);
  if (opts['dry-run']) {
    console.log('\n(dry run — nothing sent, nothing changed)');
    return;
  }

  console.log(`\nOpen the dashboard to watch. Ctrl-C stops cleanly.\n`);
  await Promise.all(
    plans.map((p) => new Simulator(api, p, `[${p.driver.name}]`).run()),
  );
}

main().catch((err) => {
  console.error(`\n❌ ${(err as Error).message}`);
  process.exit(1);
});
