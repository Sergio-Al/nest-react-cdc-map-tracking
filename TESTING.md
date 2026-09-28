# 🧪 Unit Tests

> 🇪🇸 Versión en español: [TESTING.es.md](TESTING.es.md)

Documentation for the project's unit tests. They cover the most critical business services in `tracking-service` and the command handlers in `integration-service-nest`.

**Current state: 178 tests across 12 suites, all green.**

| Service | Suites | Tests | Approx. time |
|---|---|---|---|
| `tracking-service` | 10 | 154 | ~7 s |
| `integration-service-nest` | 2 | 24 | ~2 s |

## How to run them

The tests are **pure unit tests**: every external dependency (PostgreSQL, MySQL, Kafka, Redis, TimescaleDB, Traccar) is mocked. **They need no Docker and no running infrastructure.**

```bash
# tracking-service
cd tracking-service
npm test              # full suite
npm run test:watch    # watch mode during development
npm run test:cov      # with coverage report (→ coverage/)
npx jest visits       # a single suite, by file name

# integration-service-nest
cd integration-service-nest
npm test
```

> Note: you will see `ERROR` lines in the console while the suite runs. They are expected — they come from the failure-path tests (Kafka down, TimescaleDB down, etc.) that exercise the services' error logging. What matters is Jest's final summary.

## Conventions

All suites follow the same style (the original reference file is `tracking-service/src/modules/kafka/dlq.service.spec.ts`):

- **One `*.spec.ts` file next to the service it tests** (Jest discovers them via `testRegex` in `package.json`; there is no `__tests__` folder).
- **`Test.createTestingModule` from `@nestjs/testing`** with every provider mocked via `useValue`. TypeORM repositories are injected with `getRepositoryToken(Entity, 'cacheDb')`.
- **Behavior is tested, not implementation**: what was published to Kafka, what was written to the repository, which exception was thrown — not the internal call order.
- **Kafka consumers**: `onModuleInit()` is invoked, the real handler registered on `KafkaConsumerService.registerHandler` is captured, and fabricated payloads are fed to it. This exercises the full pipeline exactly as Kafka sees it.
- **Jest fake timers** wherever there are `setInterval`s or `setTimeout` backoffs (enrichment, integration handlers) so tests are deterministic and fast (`jest.runAllTimersAsync()` drains the retry sleeps).
- **Real bcrypt** in the auth tests (cost factor 4 for speed): password hashing is genuinely verified, not mocked.

## `tracking-service` suites

### `enrichment/geo-utils.spec.ts` — 12 tests

Pure geolocation functions:

- **Haversine**: zero distance at the same point, known distances (1° of latitude ≈ 111 km), symmetry.
- **ETA**: stopped vehicle or negative speed → `null`; rounding to whole seconds.
- **Geofence**: inside/outside the radius, and the exact boundary counts as *inside* (`<=`).

### `enrichment/enrichment.service.spec.ts` — 23 tests

The heart of the GPS pipeline, tested through the real `gps.positions` handler:

- **Device→driver map**: unknown devices are dropped without touching anything downstream; `attributes.uniqueId` (e.g. `DEV001`) takes priority over Traccar's numeric `deviceId`; `refreshDriverMapping` adds/re-pairs/unpairs live (a device change evicts the previous key) and `removeDriverMapping` removes the driver from the lookup.
- **Fan-out**: the enriched position reaches Kafka (`gps.positions.enriched`, key = driverId, tenantId header), Redis (`pos:driver:*`, per-tenant GeoSet, active ZSET) and the PG snapshot. A Kafka failure does **not** sink the other destinations (`Promise.allSettled`).
- **Proximity**: distance and ETA towards the next visit's customer; fields left `null` when the customer has no coordinates.
- **Geofence auto-arrival**: fires for `pending` and `en_route` visits; does **not** fire while a visit is `in_progress`; if `markArrived` fails, the handler survives and publishes `visitAutoArrival: false`.
- **No cascade arrival** (regression): fixes inside the *current* in-progress stop's fence must not mark the *next* visit arrived — this once marked every remaining stop on a route as arrived.
- **Geofence auto-departure**: the on-site visit is departed only after 3 consecutive fixes beyond radius + 50 m; a fix back inside resets the streak, jitter within the margin is ignored, and a `markDeparted` failure doesn't break the pipeline.
- **Driver status**: marked `active` only once per process, not on every position.
- **TimescaleDB buffer**: pending rows are written on service shutdown (`onModuleDestroy`).

### `visits/visits.service.spec.ts` — 24 tests

The visit lifecycle the driver app depends on:

- **Natural idempotency**: a redundant transition into the current status is a pure no-op — no save, no Kafka event, no duplicate history row. This is what makes the app's offline outbox and repeated geofence triggers safe.
- **Per-status timestamps**: `arrivedAt` / `completedAt` / `departedAt` depending on the transition; history (`visit_completions` in TimescaleDB) is written **only** on entering a terminal state (`completed`/`skipped`/`failed`), with `durationSec` (arrival→completion) and `onTime` computed against the time window.
- **Orders**: completing a visit with an `orderId` delegates to `OrdersService.setOrderStatus`; without an `orderId` nothing is touched. Order, Kafka or TimescaleDB failures do **not** prevent the visit from completing (best-effort).
- **Driver queries**: `getNextVisitForDriver` only considers `pending`/`en_route` visits from today onward (the guard against stale visits hijacking the ETA/geofence context); `getCurrentVisitForDriver` looks up the `in_progress` visit; `getOnSiteVisitForDriver` finds the latest arrived-but-not-departed visit (including ones completed before driving off).
- **Departure**: `markDeparted` stamps `departedAt` for arrived / in-progress / completed visits, never overwrites an existing departure, and ignores visits the driver never arrived at.
- **CRUD**: creation as `pending` + route stop-count increment; deletion only allowed while `pending`; tenant-scoped lookups that 404 instead of leaking cross-tenant data.

### `auth/auth.service.spec.ts` — 28 tests

Authentication against `cached_users` (PG-owned):

- **Login**: tenant-scoped lookup; rejection of unknown user, wrong password and inactive user; the returned bundle carries the access token, the refresh token (stored in Redis with the configured TTL), the user **without** the `password` field and the effective settings.
- **Register**: duplicate check + the PG unique-violation backstop (`23505`) translated into `409 Conflict`; the password is stored hashed (verified with real `bcrypt.compare`); the 14-day reverse trial starts only for `role: 'admin'` and its failure never blocks account creation.
- **Self-serve signup**: reserved slugs (`admin`, `api`, …) rejected before claiming anything; the workspace is claimed lowercased; auto-login at the end.
- **Driver login**: one login per driver; email conflicts and already-linked driver conflicts.
- **Refresh / logout**: refresh-token rotation (the old one is deleted from Redis), rejection of unknown tokens and deactivated users.
- **`validateUser`** (per-request JWT validation): a 60 s Redis cache that avoids hitting PG on every request — a cache hit skips the DB, the password is **never** cached, and inactive users return `null` without being cached.

### `drivers/drivers.service.spec.ts` — 20 tests

PG-owned drivers and their side-effect contracts:

- **Every mutation keeps the enrichment map and Traccar in sync**: create provisions the device; a device change disables the old one and ensures the new one; a name-only change refreshes the existing device; unrelated changes (e.g. `status`) touch neither.
- **Deactivation** = soft delete: `inactive` status, cleared pairing, `removeDriverMapping`, Traccar device disabled (not deleted — history is preserved).
- **Device conflicts**: rejected by the pre-check (`deviceInUse`) and by the `23505` backstop against the check-then-insert race.
- **Seats**: `assertCanAddDriver` (a billable seat) runs **before** any write.
- **`provisionAppDevice`** (driver mobile app): mints a stable `APP-<driverId>` id for unpaired drivers; idempotent for already-paired ones (keeps the id, only re-ensures Traccar).
- **Tenant scoping**: cross-tenant ids 404 before any side effect; startup reconciliation only re-provisions paired, non-inactive drivers.

### `orders/orders.service.spec.ts` — 9 tests

The dual-mode orders entry point:

- **The create/update gate**: an `integrated` tenant with `allowAppOrderCreate: false` → `403 Forbidden` without reaching the writer; with the flag on, it passes. Standalone always passes.
- **`setOrderStatus` is never gated**: the delivery-completion write-back is integration, not origination — it works even with app creates disabled.
- **`OrderWriterResolver`**: picks the strategy per tenant from `tenant_settings.ingest_mode` (standalone ↔ integrated) and carries the create flag.
- Reads always come from `orders_cache`, newest first; tenant-scoped 404s.

### `orders/writers/order-writers.spec.ts` — 9 tests

Both write strategies, side by side:

- **`StandaloneOrderWriter`** (PG-owned, synchronous): direct insert returning the row (`mode: 'sync'` → HTTP 201); `ORD-######` number minted from the sequence when the DTO doesn't supply one; partial updates only touch present fields; a missing row → 404 on update but warn-and-continue on status writes.
- **`IntegratedOrderWriter`** (Kafka, asynchronous): each operation emits the right command on `commands.orders` (`op: create/update/status`, key = tenantId, correlationId returned as `mode: 'async'` → HTTP 202), including the completion metadata (`driverId`, `visitId`) on status commands.

### `drivers/driver-events.spec.ts` — 12 tests

The derived activity feed behind `GET /drivers/:id/events` (pure functions, no mocks needed):

- **Visit events**: arrived / completed (with time on site) / departed; skipped and failed reported at their close-out time instead of "departed"; timestamps outside the window ignored.
- **Shift start**: the first fix of the window.
- **Idle**: stopped ≥ 5 min away from any stop; short stops (traffic lights) ignored; parking at a customer is not idle — the on-site window stays open after completion until the driver departs; device gaps break a stretch (phone off is not idling).
- **Speeding**: one event per run at its peak speed; a single-fix spike (GPS noise) is ignored.
- Everything merged newest first.

### `traccar/traccar.controller.spec.ts` — 3 tests

- **Speed units**: Traccar `PositionData` speed is converted from knots to km/h (single and array payloads); the flat manual / load-test format passes through unchanged (already km/h).

### `kafka/dlq.service.spec.ts` — 14 tests *(pre-existing)*

Routing to `*.dlq` topics (`cdc.*` topics share `cdc.dlq`), diagnostic headers, counters, long-stack truncation, and the `withRetry` policy (exponential backoff, permanent errors skip retries, never throw if the DLQ publish itself fails).

## `integration-service-nest` suites

Both handlers are tested through the real handler registered on Kafka, with fake timers so retry backoffs are instant.

### `integration/customers.handler.spec.ts` — 12 tests

- **Permanent failures → straight to DLQ, one DB attempt**: invalid JSON, unknown `op`, missing `tenantId`/`name`/`id`, non-existent customer on an update.
- **Successful writes**: insert with defaults (`geofenceRadiusMeters: 100`, `customerType: 'regular'`) and the `correlationId` persisted for idempotency; partial updates with only the fields present in the command.
- **At-least-once semantics**: a duplicate `correlation_id` (Kafka redelivery of an already-applied command) is treated as **success**, not an error — no DLQ, no retry.
- **Retries**: transient DB errors retry with backoff and only reach the DLQ after all 4 attempts are exhausted; a mid-stream recovery avoids the DLQ.

### `integration/orders.handler.spec.ts` — 12 tests

Same as customers for the three operations (`create`/`update`/`status`), plus:

- **`op: 'status'`** (the delivery-completion echo): tenant-scoped update; required fields validated; a non-existent order → permanent DLQ with no retries.
- **Deterministic order number**: when a `create` command carries no `orderNumber`, one is derived from the `correlationId` (`ORD-<first 12 chars>`) — never a fresh `Date.now()` per delivery, so redeliveries hit the uniqueness constraint instead of minting new numbers.

## What is NOT unit-tested (and why)

- **Controllers, gateways and infrastructure modules** (`redis`, `timescale`, Kafka wrappers): they are thin glue; better covered by e2e against the Docker stack. (Exception: the Traccar webhook's payload normalization, which carries the knots → km/h conversion.)
- **End-to-end pipeline behaviour** (Traccar → Kafka → enrichment → geofence → visits): exercised live with `scripts/simulators/simulate-route.mts` (see the README).
- **TypeORM query-builder internals**: the observable result is asserted, not the call chain (except where the clause IS the logic, like the date filter in `getNextVisitForDriver`).
- The full CDC flow MySQL → Debezium → Kafka → cache already has its own e2e verification: `scripts/` (`smoke-orders-dual-mode.sh`) and the `/verify-cdc` skill.

## Pending coverage (next candidates)

In suggested value order:

1. `routes` — OSRM / OR-Tools request building and response mapping (mocking the HTTP).
2. `customers` — the 3-level cache (in-process Map → Redis → PG → MySQL fallback).
3. `sync` — the CDC consumer (`CdcConsumerService`) and lag monitoring.
4. Frontend (`fleetview-live-main`) — Vitest is already configured; prioritize logic-heavy hooks (e.g. `hooks/api/useReports.ts`).
