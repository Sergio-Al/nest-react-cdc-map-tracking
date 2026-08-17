# Driver Field App — Build Spec

A native iOS app for **drivers in the field**: shows the day's assigned route, reports
GPS continuously, and lets the driver complete visits with proof — **offline-first**, so
everything works through dead zones and syncs when signal returns. This document is
written to be handed to an implementing model/engineer; each section states *what* and
*why*, with concrete contracts against the existing backend.

It pairs with `OPTIMIZATION_PLAN.md`. The backend is the NestJS `tracking-service`
(REST `/api`, Socket.io `/tracking`), Traccar (GPS ingestion), and the PG-owned driver
model described in `CLAUDE.md`.

## Locked decisions

| Decision | Choice | Consequence |
|---|---|---|
| UI / state | **SwiftUI + iOS 17**, `@Observable` (Observation) | Modern MVVM, minimal boilerplate, no Combine plumbing |
| Persistence | **SwiftData** | Local store is the single source of truth |
| Concurrency | **async/await** throughout | Repositories + sync are structured-concurrency tasks |
| Maps | **MapKit (Apple)** | Native, free; offline tiles are limited (accepted) |
| Visits | **Manual complete + proof** (photo / signature / notes) | Requires a durable **offline outbox** |
| GPS transport | **Traccar OsmAnd protocol** | App is a GPS source; reuses the whole enrichment pipeline |
| Device identity | **Auto-provisioned on login** (one device per driver) | New backend endpoint + Traccar device registration |
| Auth | Existing `role:'driver'` accounts (JWT + refresh rotation) | Tokens in Keychain; single-flight refresh |

## Ground rules (inherited from CLAUDE.md — do not violate)

- Drivers are **PG-owned**. The device-provisioning endpoint extends `DriversService`
  (direct PG write + `refreshDriverMapping`). **No** MySQL writes, **no** `commands.drivers`,
  **no** `cdc.drivers`.
- Every entity carries `tenant_id`; the app never sets it — the server derives it from the
  driver's JWT.
- Any new user-visible backend string needs ES + EN keys (ES default); backend errors throw
  `{ errorCode, args }`.
- New SQL goes in `infrastructure/cache-db/init/` **and** is applied to the running dev DB
  manually (`docker exec -i cache-db psql -U tracking -d tracking_cache < <file>.sql`).

---

## 1. Architecture — local-first MVVM

The rule that makes offline-first correct: **the View layer never touches the network.**
ViewModels render SwiftData; the network only *hydrates* the store and *drains* a write queue.

```
View (SwiftUI)
  └─ @Observable ViewModel               state + intent, no I/O knowledge
       └─ Repository (protocol)          single source of truth = SwiftData
            ├─ Local store (SwiftData)   reads/writes domain rows
            ├─ Outbox (SwiftData)        queued mutations (visit completion, proof)
            └─ SyncEngine                drains outbox ↔ REST, pulls routes/visits

GPS pipeline (independent of the above):
  CoreLocation → LocationBuffer (SwiftData) → OsmAndSender → Traccar :5055
```

ViewModels depend on repository **protocols** (`VisitRepository`, `RouteRepository`,
`SessionRepository`), never on `URLSession`. Offline behavior is invisible to the View and
the whole data layer is unit-testable with in-memory fakes.

### Module layout

```
DriverApp/
  App/         SwiftUI @main, DI container, root navigation
  Core/        Networking (APIClient), Persistence (SwiftData stack),
               Auth (Keychain, TokenStore, RefreshCoordinator),
               Reachability (NWPathMonitor), Location, Logging
  Domain/      Models (domain structs), Repository protocols, errors
  Data/        Repository impls, DTOs + mappers, OsmAndSender
  Sync/        Outbox, SyncEngine, GPSPipeline, BackgroundTasks
  Features/    Auth, Today, StopDetail, Map, Proof, Settings (View + ViewModel each)
  Tests/       Repository + Sync + Outbox unit tests with in-memory store
```

---

## 2. Offline-first patterns (the core of the app)

### 2.1 Single source of truth
Every screen binds to SwiftData (`@Query` / repository reads). Completing a visit flips the
local row → the UI updates instantly; the network round-trip happens later, invisibly. The
app is fully usable with the radio off.

### 2.2 Transactional Outbox
Every mutation writes the domain change **and** an `OutboxCommand` in the **same** SwiftData
transaction. A background worker drains the outbox FIFO with exponential backoff.

```swift
@Model final class OutboxCommand {
    @Attribute(.unique) var id: UUID      // idempotencyKey — sent to the server
    var kind: String                      // "completeVisit" | "skipVisit" | "uploadProof"
    var entityId: String                  // visitId
    var payload: Data                     // JSON-encoded command body
    var attempts: Int
    var nextRetryAt: Date
    var status: String                    // "pending" | "inflight" | "failed"
    var createdAt: Date
}
```

This is the mobile twin of the backend's Phase 4b idempotency model: the client
`idempotencyKey` plays the role of `correlation_id`. "Send → crash → resend" is safe because
the server dedupes the replay.

### 2.3 Idempotent writes (server-side requirement)
`PATCH /api/visits/:id/status` must accept the `idempotencyKey` (see §5.2). The backend visit
lifecycle is **already monotonic** — it computes `becameTerminal` and does `ON CONFLICT DO
NOTHING` on completion history — so a replayed completion is a no-op. **Server is authoritative
for status transitions;** the client only asserts "completed at T with this proof." No
field-level conflict resolution is needed.

### 2.4 GPS buffer + backfill
`CoreLocation → LocationBuffer (SwiftData) → OsmAndSender`. The OsmAnd protocol carries a
per-fix `timestamp`, so positions buffered while offline **backfill with their real time** when
signal returns — and enrichment keys on position time, so history stays correct. Drain
oldest-first in batches; cap the buffer and, if it overflows, drop oldest **and log a dropped
counter** (never silently lose coverage).

### 2.5 Sync engine — layered triggers (not a naive timer)
Drain/pull on any of: reachability regained (`NWPathMonitor`), app foreground,
`BGProcessingTaskRequest` (drain while suspended), and while active location updates keep the
app alive on-route. Order each cycle: **push outbox first** (so completions register), **then
pull** the refreshed route.

### 2.6 Pull reconciliation
Routes + `planned_visits` pulled with an `updatedSince` watermark. Server wins on pull, **except**
it must not clobber a local row that still has a pending outbox command (merge guard keyed on
`entityId`).

### 2.7 Proof file lifecycle
Photo/signature saved to the app container; the outbox row references it **by path**. Upload via
multipart (§5.3). The file is deleted only **after** confirmed upload. Never base64-embed proof
in JSON.

---

## 3. Data model (SwiftData)

```swift
@Model final class Route        { id, name, date, status, stopCount, completedStops, updatedAt }
@Model final class Visit        { id, routeId, customerName, address, lat, lon, sequence,
                                  status, scheduledDate, completedAt, proofLocalPath?, updatedAt }
@Model final class LocationFix  { id, lat, lon, timestamp, speed, bearing, altitude, accuracy,
                                  battery, sent: Bool }
@Model final class OutboxCommand { …see §2.2 }
@Model final class Session      { driverId, tenantId, deviceId }   // tokens live in Keychain, not here
```

`Visit.status`: `pending | arrived | completed | skipped` (mirror backend terminal states).

---

## 4. Traccar OsmAnd integration

### 4.1 Sender
HTTP GET/POST to Traccar's OsmAnd port (`:5055`), one request per fix or small batch:
```
id={deviceId}&lat=..&lon=..&timestamp={unix}&speed=..&bearing=..&altitude=..&hdop=..&batt=..
```
- `id` = the auto-provisioned device id (§4.2).
- Always send the **device** timestamp (enables backfill; never let the server stamp time).
- Front `:5055` with TLS in production (plain OsmAnd is HTTP).

### 4.2 Device auto-provision on login
On first authenticated launch the app derives a **stable per-driver device id** and registers it:
1. `POST /api/drivers/me/device` (§5.1) → backend records it on the driver row via
   `refreshDriverMapping` **and** registers it in Traccar via the Traccar REST API so positions
   match enrichment (`device_id → driver`).
2. The app stores the returned `deviceId` in `Session` and uses it for every OsmAnd fix.

> Device id format must match the enrichment matcher (`DEV00x`-style or whatever the
> provisioning endpoint mints). One device per driver.

---

## 5. Backend changes required

All are PG-owned and respect the ground rules. Suggested branch: `feature/driver-app-api`.

### 5.1 `POST /api/drivers/me/device` — auto-provision
- Auth: `role:'driver'`; tenant + driverId from JWT.
- Body: `{ platform: 'ios', appVersion, pushToken? }`.
- Action: mint/return a stable `deviceId`, persist on the driver row, call
  `EnrichmentService.refreshDriverMapping`, and register the device in **Traccar (REST API)**.
- Returns: `{ deviceId, traccarRegistered: boolean }`.
- Idempotent: calling twice returns the same device id.

### 5.2 `Idempotency-Key` on `PATCH /api/visits/:id/status`
- Accept the client `idempotencyKey` (header or body).
- Dedupe replays; the completion-history path is already idempotent (`becameTerminal` +
  `ON CONFLICT DO NOTHING`) — this just makes the *transition* itself replay-safe.
- Keep tenant scoping (Phase 1.2 `getOwned` pattern).

### 5.3 Proof upload endpoint (multipart)
- `POST /api/visits/:id/proof` multipart: image and/or signature + `note`.
- Store to **MinIO (S3 API)** — DECIDED 2026-07-28. New `minio` container in compose; the
  backend streams the multipart upload to the bucket and stores the object key on the visit
  completion record/history. Reads via short-lived presigned URLs. Upload goes through the
  backend (not device-presigned PUT) so tenant/role checks and outbox retry semantics stay
  in one place. Same SDK path works against real S3/R2 in production.
- Tenant-scoped; `role:'driver'` may only attach to a visit on their own assigned route.

### 5.4 APNs registration + event hooks
- Persist the `pushToken` (from §5.1 or a dedicated route).
- Emit pushes on route assigned / reordered / canceled, reusing existing visit/route events.
- Provider: **raw APNs** — DECIDED 2026-07-28. Token-based (p8 key, HTTP/2) in a small NestJS
  notifications module behind a provider interface (FCM slot-in later if Android happens).
  When `APNS_*` env is unset the module logs-and-noops, mirroring the Stripe-optional pattern.

---

## 6. Auth

- Login via existing `POST /api/auth/login` (`email`, `password`, `tenantId`) as `role:'driver'`.
- Access + refresh tokens stored in **Keychain**; optional Face ID gate to resume a session.
- **Single-flight refresh** (mirror the web `auth-refresh.ts` dedup) shared by the API client and
  any socket usage, so concurrent 401s rotate the refresh token only once.
- **Offline-for-hours rule:** a failure caused by *no network* must NOT log the driver out —
  distinguish "unreachable" from "refused"; force re-login only on a genuine refresh rejection.

---

## 7. Features & screens

- **Auth**: login, biometric unlock, permission onboarding (Always location, notifications, camera).
- **Today**: assigned route, ordered stops, progress (e.g. 6/10), next-stop ETA, sync status.
- **Stop detail**: customer + address, "Navigate" (hand off to Apple Maps), call, complete/skip.
- **Complete visit**: arrive → complete/skip-with-reason, capture **proof** (camera photo,
  signature canvas, note) → writes to outbox; UI confirms immediately.
- **Map (MapKit)**: own position, route polyline, stop pins, follow mode.
- **Background tracking**: on-route banner + **Live Activity** (Dynamic Island: "On route · 4 left").
- **Sync status**: pending-count badge, "last synced", manual "Sync now" — visible trust.
- **Settings**: language (ES/EN parity), tracking toggle, sign out.

---

## 8. Open decisions — ALL RESOLVED 2026-07-28

1. **Proof storage** (§5.3): **MinIO (S3 API)** — see §5.3 for the shape.
2. **Push provider** (§5.4): **raw APNs** behind a provider interface — see §5.4.

Nothing blocks either track now; the endpoints and the iOS work can land in parallel.

---

## 9. Risks / hard parts (everything else is conventional client work)

- **Background location reliability + battery** — request `Always`; use significant-change +
  region monitoring to wake, full updates only while on-route.
- **iOS suspension** — `BGProcessingTask` to drain the outbox; never assume the app stays alive
  between stops.
- **Proof file lifecycle** — delete only after confirmed upload (§2.7).
- **Clock skew** — always send device GPS timestamps (§4.1).
- **Token expiry across long offline spans** — handle per §6; don't strand a working driver.

---

## 10. Suggested build phases

1. **Skeleton** — SwiftUI app, DI, SwiftData stack, APIClient, Keychain, login + token refresh.
2. **GPS pipeline** — CoreLocation → buffer → OsmAndSender + device auto-provision (needs §5.1).
   *Verifiable end-to-end against Traccar/enrichment before any visit UI exists.*
3. **Read path** — Today + Map from pulled routes/visits (offline-cached).
4. **Outbox + visit completion** — complete/skip + idempotent sync (needs §5.2).
5. **Proof capture** — photo/signature + multipart upload (needs §5.3).
6. **Polish** — push (§5.4), Live Activity, sync-status UI, biometric, ES/EN.

## 11. Verification

- **GPS**: log in on device → confirm a `DEV` position for the driver appears in
  `gps.positions.enriched` / the dashboard live map (proves auto-provision + OsmAnd + enrichment).
- **Offline GPS backfill**: enable Airplane Mode, move, re-enable → buffered fixes appear in
  history with their **original** timestamps.
- **Outbox**: complete a visit offline → reconnect → visit shows terminal in the web dashboard;
  re-trigger sync → no duplicate completion (idempotency holds).
- **Proof**: attach a photo offline → reconnect → proof is retrievable server-side and the local
  file is cleaned up.
- **Auth**: go offline for an extended period → app stays logged in; only a real refresh
  rejection forces re-login.
