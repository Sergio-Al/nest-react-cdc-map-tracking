# Optimization & Hardening Plan

Findings from a full-project review (2026-06-09), organized into executable phases. Each item lists the file(s), the problem, the fix, and how to verify. Work the phases in order — Phase 1 closes security holes with small diffs, Phases 2–3 unlock the 1,000-driver/500-user scale target, Phase 4 fixes silent data-correctness bugs, Phase 5 makes the load tests runnable so the rest can be measured, Phase 6 is cleanup.

## Ground rules (do not violate — see CLAUDE.md)

- **Never** add direct MySQL writes from `tracking-service`. Business data (customers/orders/products/accounts) is written only by `integration-service` via Kafka commands.
- Users and drivers are **PG-owned** (PostgreSQL `tracking_cache`). Do not re-introduce a MySQL `users` table, re-add `drivers` to the Debezium connector, or restore `cdc.drivers`/`commands.drivers`.
- TimescaleDB is accessed via a **raw `pg` Pool**, not TypeORM. Keep all queries parameterized.
- Every entity carries `tenant_id`; all queries must filter by it.
- i18n: any new user-visible string needs both ES and EN keys (ES is the default language). Backend errors throw `{ errorCode, args }` for nestjs-i18n.
- SQL init scripts in `infrastructure/cache-db/init/` only run on a fresh volume. Schema changes must also be applied manually to the running dev DB:
  `docker exec -i cache-db psql -U tracking -d tracking_cache < <file>.sql`
- After changing `integration-service-nest/`: `docker compose build integration-service && docker compose up -d integration-service`.
- Frontend type-check: `cd fleetview-live-main && npx tsc --noEmit`. Backend: `cd tracking-service && npm run build`.

---

## Phase 1 — Security & multi-tenancy (small diffs, do first)

### 1.1 WebSocket room joins leak cross-tenant data
**Files:** `tracking-service/src/modules/websocket/tracking.gateway.ts:128-152`
**Problem:** `joinRoute` has no authorization; `joinDriver` only restricts callers with role `driver`. Any authenticated user of tenant A can join `driver:{id}` / `route:{id}` rooms of tenant B and stream live positions and visit events.
**Fix:** Before `client.join()`, load the target driver/route and verify it belongs to `client.data.user.tenantId`. Reject with an error event otherwise.
**Verify:** Log in as `admin@tenant1.com`, attempt `joinDriver` with a tenant-2 driver id → rejected.

### 1.2 Tenant scoping missing on REST entity-by-id routes
**Files / endpoints:**
- `tracking-service/src/modules/drivers/drivers.controller.ts:32-35, 43-63` — `GET /drivers/:id`, `GET /drivers/:id/history`
- `tracking-service/src/modules/timescale/timescale.service.ts:148-168` — `getDriverPositionHistory` has no `tenant_id` in its SQL
- `tracking-service/src/modules/routes/routes.controller.ts:55-57, 79-81, 92-95, 97-123` — `findById`, `update`, `geometry`, `reorder`, `:id/history`
- `tracking-service/src/modules/visits/visits.controller.ts:28-36, 51-76` — `findById`, `findByRoute`, `updateStatus`, `remove`
- `tracking-service/src/modules/vehicles/vehicles.controller.ts:40-52` — `findOne`, `update`
- `tracking-service/src/modules/sync/sync.controller.ts:51-79` — returns all tenants' accounts/customers/products to tenant admins
**Problem:** Reads/writes by id never check the resource's `tenantId` against the JWT.
**Fix:** Use the JWT (`@CurrentUser()`) tenantId in every where-clause. The `getOwned()` pattern in `DriversService` is the template. Add `tenant_id = $n` to the raw Timescale SQL.
**Verify:** With a tenant-1 token, `GET /api/routes/<tenant-2-route-id>` → 404.

### 1.3 Server must own `tenantId` on writes
**Files:**
- `tracking-service/src/modules/routes/routes.controller.ts:31-34` — `POST /routes` trusts `dto.tenantId`
- `tracking-service/src/modules/visits/visits.controller.ts` — `POST /visits` trusts body `tenantId`
- `tracking-service/src/modules/customers/customers.controller.ts:25-48` — create/update Kafka commands use body `tenantId`
**Fix:** Overwrite `dto.tenantId = user.tenantId` server-side (drivers/vehicles controllers already do this — copy that pattern). Remove `tenantId` from the DTOs' accepted fields if feasible.

### 1.4 Traccar webhook is fully public
**Files:** `tracking-service/src/modules/traccar/traccar.controller.ts:13-55`, `tracking-service/src/modules/auth/auth.module.ts:42`, `tracking-service/src/config/configuration.ts:59`
**Problem:** `@Public()` with no shared-secret check — forged GPS can trigger geofence auto-arrival and flip visit/route/order statuses. An `ApiKeyGuard` is already registered and `config.auth.traccarApiKey` already exists, but neither is applied.
**Fix:** Apply the existing `ApiKeyGuard` to `TraccarController`; configure Traccar's position-forward URL to send the header. Document the env var in `.env.example`.
**Verify:** `curl -X POST localhost:3000/api/traccar/positions` without the header → 401; with it → 200.

### 1.5 Production-unsafe defaults
**Files:** `tracking-service/src/config/configuration.ts:55`, `tracking-service/src/main.ts:41`, `tracking-service/src/modules/websocket/tracking.gateway.ts:33`
**Problem:** `JWT_SECRET` falls back to `'change-me-in-production-please'`; `app.enableCors()` unrestricted; WS `cors: { origin: '*' }`.
**Fix:** Throw at bootstrap when `NODE_ENV=production` and `JWT_SECRET` (or DB/Redis passwords) are unset. Whitelist CORS origins from an env var (default to `http://localhost:5173` in dev).

### 1.6 Unique constraint on users
**Files:** new `infrastructure/cache-db/init/15-users-unique-email.sql`
**Problem:** `cached_users` has only a plain index on (email, tenant) — PG is the *owner* of users, so nothing guarantees login uniqueness; concurrent registers can create duplicate logins.
**Fix:** `CREATE UNIQUE INDEX IF NOT EXISTS uq_cached_users_tenant_email ON cached_users (tenant_id, lower(email));` Apply manually to the dev DB too. Handle the unique-violation in the register flow as a friendly 409 (`{ errorCode }` i18n pattern, like `routes.service.ts:59-71` does).

---

## Phase 2 — Backend hot path & throughput

### 2.1 GPS enrichment does ~6 sequential DB round-trips per position
**Files:** `tracking-service/src/modules/enrichment/enrichment.service.ts:139-141, 247, 341`
**Problem:** Per `gps.positions` message, sequentially: `findActiveByDriver` (eager-loads all route visits, unused beyond `route.id`), `getCurrentVisitForDriver`, `getNextVisitForDriver`, customer lookup, an **unconditional** `driverRepo.update(driverId, { status: 'active' })`, the `driver_positions` upsert, and a single-row Timescale INSERT. At 200 msg/s (1,000 drivers @ 5s) that's >1,000 queries/s before fan-out.
**Fix:**
1. Add an in-memory per-driver context cache (route id + current/next visit + customer coords), TTL ~30s, invalidated by visit/route mutations (VisitsService/RoutesService already live in the same process — emit an internal event or call a `bustDriverContext(driverId)` method).
2. Skip the driver-status UPDATE when the in-memory map already says the driver is active (reset on TTL or status-changing events).
3. Batch Timescale inserts: an unused `insertEnrichedPositionBatch` already exists at `timescale.service.ts:103` — buffer positions and flush every ~1s or 100 rows.
4. Drop `relations: ['visits']` from `findActiveByDriver` for this call path.
**Verify:** Log query counts (or use `pg_stat_statements`) before/after while running `load-tests/gps-ingestion.js`.

### 2.2 Kafka consumption is effectively single-threaded
**Files:** `tracking-service/src/modules/kafka/kafka-consumer.service.ts:39-41, 67-118`
**Problem:** One consumer, one `groupId` for ALL topics (`gps.positions`, `gps.positions.enriched`, `visits.events`, all `cdc.*`); `consumer.run({ eachMessage })` without `partitionsConsumedConcurrently` (defaults to 1). In-handler retry sleeps block the partition. A slow CDC message head-of-line-blocks GPS enrichment.
**Fix:** Set `partitionsConsumedConcurrently` (e.g. 6, matching the gps topic partition count) and split into at least two consumer groups: GPS pipeline vs CDC/WS bridge.
**Verify:** Kafka UI (localhost:8080) consumer-lag stays ~0 during the gps-ingestion load test.

### 2.3 WS fan-out: duplicates and unbatched volume
**Files:** `tracking-service/src/modules/websocket/tracking.gateway.ts:213-230`
**Problem:** Each position is emitted individually to `tenant:`, `driver:`, and `route:` rooms — a client in multiple rooms gets duplicates, and 200 pos/s × 500 clients ≈ 100k emits/s.
**Fix:** Batch tenant-room positions into ~1s aggregate frames (`positions:batch` event carrying an array). Keep per-driver/route rooms for low-volume focused views, but make the client dedupe by driver id + timestamp. Coordinate with Phase 3.1 (frontend batching) — design the batch event shape once.

### 2.4 `getActiveDrivers` uses blocking Redis KEYS and ignores tenancy
**Files:** `tracking-service/src/modules/websocket/tracking.gateway.ts:192-199`
**Problem:** `KEYS pos:driver:*` is O(N) blocking on the shared Redis, called per client request, and returns all tenants' drivers.
**Fix:** Maintain a per-tenant active-driver SET (add on position write in enrichment, EXPIRE members via a sorted set scored by last-seen) and read that. Alternatively reuse `geo:drivers:{tenant}` (see 6.3) with `ZRANGE`.

### 2.5 DB lookup on every authenticated request
**Files:** `tracking-service/src/modules/auth/strategies/jwt.strategy.ts:27-40`
**Problem:** `validateUser` does a `cached_users` findOne per request — hundreds of avoidable PG queries/s with 500 polling users.
**Fix:** Cache user-active status in Redis (~60s TTL), or trust the 15-min JWT and keep a small revocation set checked from Redis.

### 2.6 Kafka admin-client churn from health/metrics
**Files:** `tracking-service/src/modules/kafka/kafka-producer.service.ts:75-84`, `tracking-service/src/modules/sync/cdc-metrics.service.ts:221-313`
**Problem:** `isHealthy()` connects+disconnects an admin client per call on a public unthrottled `/api/health`; a 5s cron does the same and broadcasts even with no admin sockets connected.
**Fix:** Keep one persistent admin connection (or cache health ~10s); skip the broadcast when the `role:admin` room is empty.

### 2.7 No timeouts on OSRM / OR-Tools fetches
**Files:** `tracking-service/src/modules/routes/route-optimizer.service.ts:397, 479, 542`
**Fix:** `fetch(url, { signal: AbortSignal.timeout(10_000) })` on all three call sites.

---

## Phase 3 — Frontend render path & bundle

### 3.1 Whole dashboard re-renders on every WS position message
**Files:** `fleetview-live-main/src/pages/Index.tsx:29-33`, `fleetview-live-main/src/stores/map.store.ts`, `fleetview-live-main/src/components/filters/useDatasetFilters.ts:44-49`
**Problem:** `Index` subscribes to the entire `positions` record and rebuilds `driversWithPositions` (new array of new objects) un-memoized per render; `useDatasetFilters` re-runs `applyFilters` for the filtered set plus once per saved view. ~200 full-page render cascades/s at target load.
**Fix:**
1. Batch in the store: buffer incoming positions in `updatePosition` and flush with one `set` every 250–500ms.
2. Move position subscriptions down to leaf components with per-driver selectors: `useMapStore((s) => s.positions[driver.id])`.
3. Memoize derived arrays (`useMemo` keyed on the batched positions reference).

### 3.2 Leaflet markers: new DivIcon per marker per render, no clustering
**Files:** `fleetview-live-main/src/components/dashboard/TrackingMap.tsx:50, 113-121, 35-40`
**Problem:** `createDriverIcon(...)` returns a fresh `DivIcon` each render → react-leaflet calls `setIcon()` (innerHTML replacement) on ALL markers when any one driver moves. The follow-mode effect (`MapController`) also depends on the whole positions object.
**Fix:** Memoize icons keyed by `(status, initials, isSelected)`; wrap markers in a `React.memo` component selecting its own position; add clustering (`leaflet.markercluster` or supercluster) for 1,000 pins; follow-mode effect selects only `positions[selectedDriverId]`.

### 3.3 Driver inbox: no virtualization or memoization
**Files:** `fleetview-live-main/src/components/dashboard/DriverInbox.tsx:356-363`
**Fix:** Virtualize with `@tanstack/react-virtual`; `React.memo` on `InboxRow`; stable `onSelect` via `useCallback` + id argument. Consider debouncing the speed-based re-sort so rows don't reorder constantly while streaming.

### 3.4 console.log per position
**Files:** `fleetview-live-main/src/hooks/useDriverPositions.ts:20`
**Fix:** Delete (or gate behind `import.meta.env.DEV`).

### 3.5 No route-level code splitting — 1.44 MB single chunk (414 kB gzip)
**Files:** `fleetview-live-main/src/App.tsx:11-22`
**Problem:** All pages statically imported; Recharts (Reports only) and dnd-kit (Routes only) ship to everyone.
**Fix:** `React.lazy()` each page with a `Suspense` fallback inside `AppLayout`'s outlet.
**Verify:** `bun run build` → main chunk well under 500 kB; Reports/Routes get their own chunks.

### 3.6 Socket reconnect gives up and can orphan sockets
**Files:** `fleetview-live-main/src/lib/socket.ts:26-28, 36`
**Problem:** `reconnectionAttempts: this.maxReconnectAttempts` (the value is set to 5 elsewhere in the class — note: the literal `5` is not on this line) caps reconnection at ~20s, so laptop sleep kills the live dashboard permanently; the `connect()` guard is `if (this.socket?.connected)`, so a mid-reconnect socket gets orphaned (leaked listeners, duplicate connections).
**Fix:** `reconnectionAttempts: Infinity` (keep a toast after N failures); guard on `if (this.socket)` and update `socket.auth` + `socket.connect()` instead of recreating. Also reconnect on `window` `online`/`visibilitychange`.

### 3.7 Token refresh implemented twice (race → double rotation)
**Files:** `fleetview-live-main/src/lib/socket.ts:96-142` duplicates `fleetview-live-main/src/lib/axios.ts:92-141`
**Fix:** Extract one shared `refreshTokens()` (keep the in-flight de-dup `axios.ts` already has) and call it from both.

### 3.8 Hardcoded English toasts in socket layer
**Files:** `fleetview-live-main/src/lib/socket.ts:43, 72, 74, 136`
**Fix:** `import i18n from '@/i18n'`, use `i18n.t(...)` with new keys added to BOTH `en` and `es` locale files (e.g. in the `errors` or a `connection` namespace).

### 3.9 Smaller render fixes
- `fleetview-live-main/src/components/dashboard/MapControls.tsx:43` — subscribes to all positions but only uses them in a click handler → read `useMapStore.getState().positions` inside the handler.
- `fleetview-live-main/src/App.tsx:24` — `new QueryClient()` with no defaults → set `defaultOptions: { queries: { staleTime: 30_000 } }`.

---

## Phase 4 — Data-correctness bugs

### 4.1 Real visit completions are never written to history
**Files:** `tracking-service/src/modules/timescale/timescale.service.ts:132-144`, `tracking-service/src/modules/visits/visits.service.ts` (updateStatus)
**Problem:** `insertVisitCompletion` has zero callers — `/api/history/visits` and the reports on it show only seeded demo data; real completions are silently lost.
**Fix:** Call `insertVisitCompletion` from `VisitsService.updateStatus` when a visit reaches a terminal state (completed/failed/skipped).
**Verify:** Complete a visit via the API → row appears in Timescale `visit_completions`.

### 4.2 MySQL writes not idempotent under Kafka at-least-once delivery
**Files:** `integration-service-nest/src/modules/integration/customers.handler.ts:88-99`, `integration-service-nest/src/modules/integration/orders.handler.ts` (applyCreate)
**Problem:** Plain `insert` with no correlationId dedupe → redelivery after a rebalance/crash duplicates customers. Orders are worse: missing `orderNumber` is generated as `ORD-${Date.now()}` inside the consumer, so the unique key can never catch a redelivery.
**Fix:** Add a `correlation_id` column with a UNIQUE key on customers/orders (MySQL migration in `infrastructure/`), or derive `order_number` deterministically from `cmd.correlationId`. Treat `ER_DUP_ENTRY` as success ("already applied"), not a retryable error (currently any DB error retries 4× then DLQs — see `customers.handler.ts:101-108`, `orders.handler.ts:78-92`).
**Verify:** Replay the same command message twice (Kafka UI or DLQ replay) → exactly one MySQL row.

### 4.3 `getNextVisitForDriver` ignores date/route
**Files:** `tracking-service/src/modules/visits/visits.service.ts:71-78`
**Problem:** Picks the lowest-sequence pending visit across ALL dates/routes — one stale unfinished visit from last week permanently hijacks the driver's ETA/geofence/auto-arrival.
**Fix:** Filter by the active route id (enrichment already has it) or `scheduled_date = today`.

### 4.4 `completedStops` counter race
**Files:** `tracking-service/src/modules/visits/visits.service.ts:106-109`
**Fix:** Replace `count(completed) + 1` with an atomic `UPDATE routes SET completed_stops = (SELECT COUNT(*) FROM planned_visits WHERE route_id = ... AND status = 'completed')` after save.

### 4.5 Unbounded list queries
**Files:** `tracking-service/src/modules/routes/routes.service.ts:107-114` (every route ever, all visits eager-loaded), plus `customers.getAllByTenant`, `orders.getAllByTenant`, `sync.controller` lists.
**Fix:** Default a date window (e.g. last 14 days) when `from/to` absent; add `take`/pagination to the others.

### 4.6 TimescaleDB retention + dedupe gaps
**Files:** `infrastructure/timescale/init/01-init.sql`
**Problem:** `visit_completions` and `driver_daily_stats` have no retention policy (unbounded growth); neither hypertable has a unique index, so at-least-once consumption can write duplicate history rows that skew playback/stats.
**Fix:** `add_retention_policy('visit_completions', INTERVAL '2 years')` (+ on the cagg); unique index on `(driver_id, time)` for positions and `(visit_id, time)` for completions — create BEFORE enabling compression on new chunks. Apply manually to the running timescale container as well as the init script.

### 4.7 Retry budget drains backlog to DLQ during MySQL blips
**Files:** `integration-service-nest/src/modules/integration/customers.handler.ts:14`, `orders.handler.ts:18`, `integration-service-nest/src/.../kafka-consumer.service.ts`
**Problem:** 3 retries at 300/600/1200ms (~2.1s total) — a MySQL restart turns the whole queued backlog into DLQ entries.
**Fix:** On connection-class errors, `consumer.pause()` the topic and resume after a backoff instead of DLQ-ing. Also: the consumer's last-resort catch in `eachMessage` advances the offset with only a log (silent message loss) — DLQ there too.

---

## Phase 5 — Make the load tests actually run

### 5.1 `full-scenario.js` imports non-existent named exports
**Files:** `load-tests/full-scenario.js:1-2`, `load-tests/gps-ingestion.js`, `load-tests/ws-consumers.js`
**Fix:** In both target files, convert to named exports (`export function gpsIngestion() {...}`) and keep `export default` for standalone runs.

### 5.2 Seed script fails against the partial unique index
**Files:** `scripts/seed-load-test-drivers.sql:44`, cf. `infrastructure/cache-db/init/09-drivers-device-unique.sql:21-23`
**Problem:** `ON CONFLICT (device_id)` can't be inferred from the partial index `... WHERE device_id IS NOT NULL`.
**Fix:** `ON CONFLICT (device_id) WHERE device_id IS NOT NULL DO UPDATE ...`.

### 5.3 k6 metric conflation
**Files:** `load-tests/gps-ingestion.js:124-128`
**Problem:** `position_errors` includes the `<200ms` latency check, so slow-but-successful requests spuriously fail the `rate<0.01` threshold.
**Fix:** Split correctness checks from latency checks into separate metrics/thresholds.

### 5.4 Verify end-to-end
Run: seed → `k6 run load-tests/full-scenario.js` → watch consumer lag (Kafka UI :8080), backend `/api/health`, and frontend smoothness. This is the acceptance test for Phases 2–3.

---

## Phase 6 — Cleanup & hygiene (low risk, do opportunistically)

- **Dead backend code:** `markDeparted` (`visits.service.ts:163` — note: wiring this UP would enable auto-departure; decide wire-or-delete), `DriversService.upsertPosition` (`drivers.service.ts:207`), `warmCacheForTenant`/`getGeoCustomers` (`customer-cache.service.ts:79,102`), unused Redis helpers (`hset/hget/hgetall/hdel/geodist/georadius/publish`). (`insertEnrichedPositionBatch` gets USED by 2.1; `ApiKeyGuard` gets used by 1.4.)
- **Hot-path Redis GEO writes nothing reads:** `enrichment.service.ts:266-271` — either delete or use for 2.4 (decide there first).
- **Dead frontend files:** `src/data/mockData.ts`, `src/data/types.ts`, `src/components/NavLink.tsx`, `src/App.css` (zero importers, verified).
- `visits.controller.ts:60` — `this.visitsService['routesService']` bracket-access of a private dep → inject `RoutesService` properly.
- `tracking.gateway.ts:103-108` — `connectedClients` decrements for auth-rejected sockets never incremented → counter drifts negative in `/api/health`.
- `cdc-consumer.service.ts:188-196` — `sync_state` upsert per CDC message → debounce to once/5s per table.
- `main.ts:54` — floating `bootstrap()` promise → add `.catch()`.
- **Compose:** add a healthcheck to `integration-service` (note: node:alpine has no curl — use wget) and make `/healthz` reflect consumer-running state (`startWithRetry` gives up after 12 attempts while healthz keeps returning ok). Add memory limits to kafka/mysql/timescale/cache-db/redis/traccar. Pin `kafka-ui` and `osrm` image tags (currently `:latest`). Remove the stale `cdc.users` topic from kafka-init (`docker-compose.yml:101`) — users were cut from CDC.
- **integration-service Dockerfile:** `npm ci` instead of `npm install`, add `USER node`.
- **Debezium as MySQL root:** `scripts/register-cdc-connector.sh:31-34` — create a `debezium` MySQL user with only `SELECT, RELOAD, REPLICATION SLAVE, REPLICATION CLIENT` on `core_business`.
- `infrastructure/mysql/conf/my.cnf:6` — deprecated `expire_logs_days` → `binlog_expire_logs_seconds`.
- **Dev port mismatch:** `fleetview-live-main/vite.config.ts` sets `port: 3001` but docs say 5173 → align (prefer fixing config to 5173 to match all docs).
- Expired in-process customer-cache entries only evicted on read (`customer-cache.service.ts:19`) → add periodic sweep or max size.

---

## What NOT to change (verified good — leave alone)

- DLQ design in `tracking-service` (`dlq.service.ts`): transient-vs-permanent classification, backoff, replay endpoints.
- Enrichment fan-out's `Promise.allSettled` with named-destination failure reporting.
- All raw `pg` SQL is parameterized — keep it that way.
- Partial unique indexes + friendly-409 race handling (`routes.service.ts:59-71`, `drivers.service.ts:253-266`).
- Session-lifetime socket singleton pattern (`useSocket.ts`) and tenant-room auto-join on connect.
- Playback interval reading `usePlaybackStore.getState()` (correct stale-closure avoidance).
- ES↔EN i18n parity across all namespaces — preserve it for any string you add.
- Traccar provisioning via BullMQ + opossum circuit breaker; Stripe webhook signature verification.
- TimescaleDB init structure (chunk intervals, compression segmentby/orderby, tz-aware cagg) — only ADD the retention/dedupe items from 4.6.

## Suggested execution order & checkpoints

| Step | Scope | Checkpoint |
|---|---|---|
| 1 | Phase 1 (security) | tenant-isolation curl tests pass; `npm run build` clean |
| 2 | Phase 5 (load tests runnable) | `k6 run full-scenario.js` starts and completes |
| 3 | Phase 2 (backend hot path) | consumer lag ~0 under load; PG query rate down ~5× |
| 4 | Phase 3 (frontend) | smooth at 1,000 simulated drivers; main chunk < 500 kB; `tsc --noEmit` clean |
| 5 | Phase 4 (correctness) | duplicate-replay test passes; visit completions appear in history |
| 6 | Phase 6 (cleanup) | builds clean, docker compose healthy |
