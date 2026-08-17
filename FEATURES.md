# Platform Features

A catalog of what the platform does, written for building feature cards. Each entry has a **tagline** (card title/subtitle), a **description** (card body), and a **workflow** (the flow to illustrate on the card back / detail). Grouped by domain.

> Product in one line: a multi-tenant, real-time vehicle-distribution tracking platform — live fleet positions, route planning & optimization, planned-visit lifecycle, orders, analytics, and self-serve SaaS onboarding/billing. Targets 1,000 drivers and 500 concurrent dashboard users.

---

## 1 · Real-time Tracking & GPS

### Live Fleet Map (Mission Control)
- **Tagline:** See every driver moving, live.
- **Description:** A real-time map of the fleet — driver markers, speed, current route/visit, and status — updated continuously over WebSockets. The home screen for dispatchers.
- **Workflow:**
  1. Dashboard connects to the WebSocket and joins its `tenant` room.
  2. Each enriched GPS position is pushed to the browser and animates the driver marker.
  3. Clicking a driver opens a detail panel (current position, route, ETA, mini-map).
- **Roles:** all signed-in users.

### GPS Ingestion (Traccar → backend)
- **Tagline:** Phones and GPS devices stream in.
- **Description:** Driver devices send positions to a Traccar server, which forwards them to the backend webhook; raw positions enter the streaming pipeline.
- **Workflow:**
  1. Driver app / Traccar Client sends positions tagged with a device `uniqueId`.
  2. Traccar forwards them to `POST /api/traccar/positions`.
  3. The backend publishes raw positions to the `gps.positions` stream for enrichment.

### Position Enrichment & Auto-Arrival
- **Tagline:** Raw dots become operational insight.
- **Description:** Each raw position is matched to a driver (by `device_id`), joined with route/visit/customer data, and decorated with distance/ETA to the next stop and geofence detection — which can auto-mark a visit as "arrived."
- **Workflow:**
  1. Consume raw position → resolve `device_id` → driver.
  2. Join active route/visit + next customer; compute distance & ETA.
  3. Detect geofence entry → optionally auto-arrival on the visit.
  4. Fan out enriched position to Redis, the PG cache, history (TimescaleDB), and the WebSocket.

### Traccar Device Auto-Provisioning *(control plane)*
- **Tagline:** Assign a device — we register it for you.
- **Description:** Traccar only accepts positions for devices it already knows. When an admin assigns/pairs a `device_id` to a driver, the platform automatically creates and keeps that Traccar device in sync — no manual step in Traccar's UI. Resilient: it never blocks driver edits and self-heals if Traccar is briefly down.
- **Workflow:**
  1. Admin assigns/pairs a device to a driver.
  2. A background job (queued, with retry + exponential backoff behind a circuit breaker) ensures the matching Traccar device exists and is enabled.
  3. On deactivate/unpair the Traccar device is **disabled, not deleted** (re-enabled on re-pair).
  4. The driver's device only needs to send positions with the assigned id — everything else is automatic.

---

## 2 · Fleet Operations

### Driver Management
- **Tagline:** Your roster, owned and instant.
- **Description:** Create, edit, soft-deactivate drivers and pair their tracking device. Writes are synchronous (source of truth in the platform DB), and the live tracking map updates without a restart.
- **Workflow:**
  1. Admin/dispatcher creates a driver (name, phone, vehicle, optional device).
  2. Pair a device id → tracking + Traccar provisioning kick in.
  3. Deactivate → driver goes inactive and stops matching live GPS (history preserved).

### Driver Login Provisioning
- **Tagline:** Give a driver their own account.
- **Description:** A driver record is operational and has no credentials by default. An admin provisions a login (admin-entered email + password) linked to the driver, so they can sign in; the session is scoped to their own data.
- **Workflow:**
  1. On a driver, admin clicks **Create login** and enters email + password.
  2. A `driver`-role account is created, linked to the driver (one login per driver; tenant taken from the admin's session).
  3. The driver signs in with email + password + workspace; their token grants driver-scoped access (own visits, self-pair).
  4. The driver card shows a **Has login** badge once provisioned.
- **Note:** the web dashboard is admin/dispatcher-oriented; the full driver experience is the planned companion app.

### Vehicle Management
- **Tagline:** Track the fleet's assets.
- **Description:** CRUD for vehicles (plate, type, brand/model, year, capacity, status) with optional driver assignment and a filterable list.
- **Workflow:** Admin/dispatcher creates/edits a vehicle → it appears in the list and can be linked to a driver.

### Route Planning & Builder
- **Tagline:** Compose the day's routes.
- **Description:** Build a route as an ordered set of customer stops using a fast command-palette add-stop UX; one active route per driver per day is enforced.
- **Workflow:**
  1. Create a route for a driver/date.
  2. Add stops (customers) via the add-stop palette; reorder as needed.
  3. Save → the route is ready to optimize or dispatch.

### Route Optimization
- **Tagline:** Best order, least distance.
- **Description:** Optimize a route's stop order using real road distances (OSRM) and a vehicle-routing solver (OR-Tools). *(Plan feature — Growth and up.)*
- **Workflow:**
  1. On a route, click **Optimize**.
  2. Backend pulls a distance matrix (OSRM) and solves the order (OR-Tools).
  3. The route is re-sequenced with computed distance/duration.

### Planned Visits Lifecycle
- **Tagline:** Every stop, tracked end to end.
- **Description:** Each stop is a planned visit moving through `pending → arrived → in_progress → completed → departed`, with automatic arrival/departure from geofencing and event broadcasting. A completed visit carrying an order flips that order's status.
- **Workflow:**
  1. Visits are created as part of a route.
  2. Driver approaches a stop → geofence → auto-arrival (or manual status change).
  3. Complete the visit → if it carries an order, the order is marked completed (synchronously in standalone mode, via the integration pipeline in integrated mode).

---

## 3 · Orders & Business Data

### Orders (Dual-Mode)
- **Tagline:** Orders that fit how you run.
- **Description:** Manage delivery orders in two modes per tenant: **standalone** (the platform owns orders — instant create/read) or **integrated** (orders flow from an external system via the change-data-capture pipeline). The right write path is chosen automatically per tenant.
- **Workflow:**
  1. Tenant's mode is read at request time.
  2. **Standalone:** `POST /orders` writes directly and is immediately readable (`201`).
  3. **Integrated:** `POST /orders` emits a command (`202`); it lands via the external system → CDC → cache (~seconds). Creation can be gated off for integrated tenants whose orders are ERP-owned.
  4. Completing a linked visit echoes the order status back through the same per-tenant path.

### Customers (3-Level Cache)
- **Tagline:** Customer data, fast and consistent.
- **Description:** Customer reads are served from a layered cache (in-process → Redis → PG cache → source DB) for low latency at scale; writes in integrated mode are eventually consistent via the command pipeline.
- **Workflow:** Read → check memory, then Redis, then PG cache, then source. Create (integrated) → command → external write → CDC → cache.

---

## 4 · Analytics & Visibility

### History & Playback
- **Tagline:** Rewind any driver or route.
- **Description:** Replay historical positions and visit timelines from the time-series history store — see where a driver/route went and when.
- **Workflow:** Pick a driver/route + date range → scrub the recorded path and visit events.

### Reports & Analytics
- **Tagline:** Operational analytics, leaderboards, exports.
- **Description:** A reporting workspace with tabs — Overview KPIs, Routes (with drilldown), Drivers + Visits leaderboards, Vehicles, Customers — plus CSV export. Timezone-aware date ranges. *(Plan feature — Growth and up.)*
- **Workflow:**
  1. Choose a date preset/range and comparison mode.
  2. Browse tabs; drill into a route or driver.
  3. Export the current view to CSV from the header.

### Monitoring (CDC Lag) *(admin)*
- **Tagline:** Is the data pipeline healthy?
- **Description:** Admin view of change-data-capture lag and sync health across cached tables.
- **Workflow:** Admin opens Monitoring → sees per-table lag and event counts.

### DLQ Admin *(admin)*
- **Tagline:** Nothing is silently dropped.
- **Description:** Failed pipeline messages retry with backoff and land in dead-letter topics, inspectable and replayable by admins.
- **Workflow:** Admin peeks a DLQ topic → reviews the error → replays or discards.

---

## 5 · Onboarding & Billing (SaaS)

### Self-Serve Signup
- **Tagline:** Create a workspace in seconds, no card.
- **Description:** A public signup that creates a workspace + owner-admin and starts a 14-day reverse trial — then logs the user straight into the dashboard.
- **Workflow:**
  1. Visitor opens **Request access / Sign up**.
  2. Enters a workspace **name** → a **workspace ID** is suggested and checked for availability live; plus name, email, password, accept terms.
  3. Submit → workspace + owner created, trial started, auto-login → dashboard.
  4. Teammates are added later by the admin (drivers/dispatchers).

### Subscription Plans & Entitlements
- **Tagline:** Tiers that gate capabilities.
- **Description:** Plans (Starter / Growth / Business) define seat limits, included features, and whether system-integration is allowed. Entitlements are enforced server-side everywhere.
- **Workflow / gates:**
  - **Seats:** adding a driver beyond the plan cap is blocked (upgrade prompt).
  - **Features:** route optimization and reports are gated to the plans that include them.
  - **Integration:** turning on integrated mode requires a plan that allows it.
  - A new tenant with no subscription falls back to free Starter defaults.

### Billing Lifecycle (Stripe)
- **Tagline:** Trial → add a card → subscribed.
- **Description:** Stripe-backed billing: hosted Checkout to add a card and convert, a Billing Portal to manage/cancel, a daily job that downgrades lapsed trials, and webhook ingestion that keeps the local subscription in sync.
- **Workflow:**
  1. Reverse trial auto-starts on signup (no card).
  2. **Add payment method** → Stripe Checkout → on success the subscription activates.
  3. **Manage billing** → Stripe Billing Portal.
  4. Stripe webhooks update plan/status/seats/renewal; un-converted trials auto-downgrade to free.

### Billing & Plan UI
- **Tagline:** Your plan, at a glance.
- **Description:** A Settings card showing current plan + status, a trial countdown, seat usage, a plan picker (upgrade/choose), and manage-billing — driven by live entitlements.
- **Workflow:** Admin opens Settings → Billing → sees trial/renewal state, seats used, and acts (upgrade / add card / manage).

---

## 6 · Platform Foundations

### Multi-Tenancy & Workspaces
- **Tagline:** Isolated workspaces, one platform.
- **Description:** Every entity is tenant-scoped; a tenants registry anchors workspace identity and uniqueness. Users belong to one workspace and log in with email + password + workspace.
- **Workflow:** Sign in with a workspace ID → all data and actions are scoped to that tenant.

### Authentication & Roles
- **Tagline:** Secure access, scoped by role.
- **Description:** JWT auth with refresh tokens and role-based access (admin, dispatcher, driver). Drivers are restricted to their own data; admins manage the workspace.
- **Workflow:** Login → access + refresh tokens (token refreshed transparently); guards enforce roles and driver-ownership per route.

### Settings (Tenant + User) & Timezone
- **Tagline:** Sensible defaults, personal overrides.
- **Description:** Tenant-default and per-user preferences (timezone, locale, date/number format, units, default report range, theme, density). Effective settings resolve user → tenant → system.
- **Workflow:** Admin sets workspace defaults; each user overrides their own; reports and timestamps respect the resolved timezone.

### Bilingual Interface (ES / EN)
- **Tagline:** Spanish-first, English-ready.
- **Description:** Full UI and API error localization, Spanish by default with English opt-in, kept in strict key parity.
- **Workflow:** User switches language → all labels and server error messages localize.

### Integration Mode / CDC Pipeline
- **Tagline:** Sync from your existing system.
- **Description:** For integrated tenants, business data (customers/accounts/products/orders) flows from the source system through a command → write → change-data-capture → cache pipeline; the dashboard reads the always-current cache.
- **Workflow:** App emits a command → integration service writes the source DB → CDC streams the change → the platform cache upserts → dashboard reads it (~seconds).

### Resilience (Queues, Retries, Circuit Breaker)
- **Tagline:** Degrades gracefully, self-heals.
- **Description:** External side-effects (e.g. Traccar device sync) and pipeline consumers use durable queues with retry + exponential backoff, dead-letter topics, and a circuit breaker — so a down dependency never blocks core actions and recovers automatically.
- **Workflow:** Action enqueues a job → worker retries with backoff → circuit breaker fails fast when a dependency is down → job completes once the dependency returns.

---

## Appendix — Plan tiers (for pricing cards)

| Plan | Seats (drivers) | Highlights | Integration |
|---|---|---|---|
| **Starter** | up to 3 (free) | Live tracking, playback, history | No |
| **Growth** | per-seat | + Route optimization, Reports | No |
| **Business** | per-seat | + External system integration, API access | Yes |

*Live GPS, playback, and route history are always-on core for every plan — never paywalled. The integration upsell covers business-data sync (customers/accounts/products/orders) and the external API.*

---

## Status legend (optional, for card badges)
- **Live & verified:** tracking, enrichment, Traccar auto-provisioning, drivers + login, vehicles, routes + optimization, visits, orders (dual-mode), customers, history, reports, settings, i18n, multi-tenancy, auth, signup, subscriptions/entitlements, billing lifecycle + UI, resilience.
- **Operational/ops to finish for production:** Stripe go-live needs real Products/Prices + keys; per-tenant Traccar isolation; the driver companion app (consumer of driver logins).
