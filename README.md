# 🚚 Real-Time Vehicle Distribution Tracking System

A Real-time vehicle tracking system designed to monitor at least **1,000 drivers** making deliveries, with a dashboard supporting **500 concurrent users** viewing live positions, planned visits, route history, and route playback.

> 📖 [Leer en Español](README.es.md)

---

## 📋 Table of Contents

- [System Architecture](#-system-architecture)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
- [Running the Application](#-running-the-application)
- [Data Flows](#-data-flows)
- [NestJS Service Modules](#-nestjs-service-modules)
- [REST API](#-rest-api)
- [Kafka Topics](#-kafka-topics)
- [Database Schemas](#-database-schemas)
- [Design Patterns](#-design-patterns)
- [Internationalization](#-internationalization)
- [Manual Testing](#-manual-testing)
- [Project Status](#-project-status)

---

## 🏗 System Architecture

```
GPS Devices (1000)
       │ TCP/UDP
       ▼
┌──────────────┐     ┌──────────────┐
│   TRACCAR    │────▶│  Traccar DB  │
│   Server     │     │ (PostgreSQL) │
└──────┬───────┘     └──────────────┘
       │ HTTP Webhook
       ▼
┌──────────────────────────────────────────────────────────────┐
│                       APACHE KAFKA                           │
│                                                              │
│  Topics:                                                     │
│  • gps.positions / gps.positions.enriched / gps.events       │
│  • visits.events                                             │
│  • commands.customers  (command topic)                       │
│  • cdc.customers / cdc.accounts / cdc.products / cdc.orders  │
└──────┬──────────────────────────────────────┬────────────────┘
       │                                      │
       │  commands.customers                   │  cdc.* / gps.* / visits.*
       ▼                                      ▼
┌──────────────────────┐    ┌─────────────────────────────────────────────┐
│ INTEGRATION SERVICE  │    │         TRACKING SERVICE (NestJS)            │
│ (NestJS service)     │    │                                             │
│                      │    │  ┌─────────────┐  ┌──────────────────────┐  │
│ • Kafka consumer     │    │  │  Traccar     │  │ Kafka Consumers      │  │
│ • commands.customers │    │  │  Webhook     │  │ • GPS Positions      │  │
│ • drivers: dormant   │    │  │  Controller  │  │ • CDC Sync           │  │
│ • Writes to MySQL    │    │  └──────┬───────┘  │ • Visit Events       │  │
│ • Retry + DLQ        │    │         │          └──────────┬───────────┘  │
│ • /healthz :8090     │    │         ▼                     ▼              │
└──────────┬───────────┘    │  ┌──────────────────────────────────────┐   │
           │                │  │       Enrichment Service              │   │
           ▼                │  │  • Join GPS + driver/customer/visit   │   │
    ┌──────────────┐        │  │  • Calculate proximity & ETA          │   │
    │    MySQL     │        │  │  • Detect arrival/departure           │   │
    │ (Source of   │        │  └──────────────────────────────────────┘   │
    │   Truth)     │        │         │                                    │
    └──────┬───────┘        │   ┌─────┼──────────┬───────────────┐        │
           │                │   ▼     ▼          ▼               ▼        │
     Debezium CDC           │ ┌─────┐ ┌────────┐ ┌──────────┐ ┌───────┐  │
           │                │ │Redis│ │Cache PG│ │Timescale │ │  WS   │  │
           ▼                │ └─────┘ └────────┘ └──────────┘ └───────┘  │
    cdc.* (no drivers)      └─────────────────────────────────────────────┘
    drivers are PG-owned (direct PG writes; no cdc.drivers)
```

---

## 🛠 Technology Stack

| Component | Technology | Version | Purpose |
|---|---|---|---|
| GPS Server | Traccar | 6.11 | Protocol decoding, device management |
| Traccar DB | PostgreSQL | 16 | Traccar's internal storage |
| Message Broker | Apache Kafka | 3.9.0 (KRaft mode) | Event streaming, decoupling |
| CDC | Debezium | 2.7.3.Final | MySQL → Kafka change capture |
| Source of Truth DB | MySQL | 8.0 | Core business data (Customers, Accounts, Orders, Products) |
| Backend Service | NestJS | 10+ | Main tracking service |
| Local Cache DB | PostgreSQL | 16 | Synced MySQL data, visits, routes |
| Historical DB | TimescaleDB | latest-pg16 | Time-series, position history, analytics |
| Cache / Pub-Sub | Redis | 7-alpine | Latest positions, 3-level cache |
| Routing Engine | OSRM | latest | Road distance/duration matrix (La Paz, Bolivia) |
| Integration Service | NestJS | 10+ | Kafka → MySQL command consumer (customers) |
| Route Optimizer | OR-Tools (Python) | 9.x | VRP solver via FastAPI sidecar |
| WebSocket | Socket.io | 4+ | Real-time push to dashboard |
| Language | TypeScript | 5+ | Backend services |
| Containers | Docker + Docker Compose | Latest | Development environment |

---

## 📁 Project Structure

```
streaming-tracking-logistic/
├── .env.example                      # Template for environment variables
├── .env                              # Environment variables (gitignored)
├── .gitignore
├── docker-compose.yml                # All services orchestration
├── INIT-PLAN.md                      # Original implementation plan
├── AUTH_IMPLEMENTATION.md
├── README.md                         # This file (English)
├── README.es.md                      # Spanish version
│
├── infrastructure/
│   ├── mysql/
│   │   ├── conf/my.cnf               # Binlog configuration (ROW, GTID)
│   │   └── init/
│   │       ├── 01-init.sql           # Tables + seed data (accounts, customers, products, orders)
│   │       └── 03-drivers.sql        # MySQL drivers table (legacy; drivers now PG-owned, kept for dormant inbound-sync)
│   ├── cache-db/
│   │   └── init/
│   │       ├── 01-init.sql           # Cache schema (sync, drivers, routes, visits, positions)
│   │       ├── 02-cached-users.sql   # Users table (source of truth, owned by tracking-service) + admin seed accounts
│   │       ├── 03-route-optimizer.sql # Route optimization columns (routes & planned_visits)
│   │       ├── 04-seed-customers-lapaz.sql # La Paz customer seed data (20 tenant-1, 3 tenant-2)
│   │       ├── 05-vehicles.sql       # Vehicles table + seed data
│   │       ├── 06-routes-unique-driver-date.sql # One active route per driver per day (partial unique index)
│   │       ├── 07-routes-depot.sql    # Per-route depot columns
│   │       └── 08-settings.sql        # tenant_settings + user_settings + tenant-default seed
│   ├── osrm/
│   │   ├── setup.sh                  # Downloads Bolivia OSM, clips La Paz region, builds OSRM graph
│   │   └── data/                     # OSRM preprocessed data files (generated by setup.sh)
│   ├── or-tools-solver/
│   │   ├── Dockerfile                # Python 3.11 + FastAPI + OR-Tools
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── main.py               # FastAPI server (POST /solve)
│   │   │   ├── models.py             # Pydantic request/response models
│   │   │   └── solver.py             # OR-Tools VRP/TSP solver with time windows
│   │   └── tests/
│   │       └── test_solver.py        # Solver unit tests
│   ├── timescale/
│   │   └── init/01-init.sql          # Hypertables, compression, retention, continuous aggregates
│   └── traccar/
│       └── traccar.xml               # Traccar configuration (webhook, ports)
│
├── integration-service-nest/          # NestJS microservice (Kafka → MySQL)
│   ├── Dockerfile                    # Multi-stage node:20-alpine build
│   ├── package.json
│   └── src/
│       ├── main.ts                   # Bootstrap: HTTP (health/metrics) on :8090
│       ├── config/configuration.ts   # Env-based configuration
│       ├── database/database.config.ts # TypeORM MySQL connection (synchronize:false)
│       ├── modules/kafka/            # Producer, consumer (group), DLQ service
│       ├── modules/integration/
│       │   ├── customers.handler.ts  # commands.customers handler
│       │   ├── drivers.handler.ts    # commands.drivers handler (DORMANT — drivers now PG-owned)
│       │   └── entities/             # MySQL customers + drivers entities
│       ├── modules/metrics/          # Prometheus-style counters
│       └── modules/health/           # /healthz + /metrics endpoints
│
├── scripts/
│   ├── register-cdc-connector.sh     # Registers/updates the Debezium connector (idempotent PUT upsert)
│   ├── smoke-orders-dual-mode.sh     # End-to-end smoke test: standalone (PG) vs integrated (CDC) orders
│   ├── seed-visit-completions.sql    # Seeds completed visits for report/history demos
│   ├── migrate-daily-stats-tz.sql    # Backfills timezone-bucketed driver_daily_stats
│   ├── seed-load-test-drivers.sql    # Generates 1,000 test drivers (LOAD0001-LOAD1000)
│   └── cleanup-load-test-drivers.sql # Removes load test drivers and their positions
│
├── load-tests/                       # k6 load testing scripts
│   ├── gps-ingestion.js              # 1,000 GPS device simulation
│   ├── ws-consumers.js               # 500 WebSocket client simulation
│   ├── full-scenario.js              # Combined GPS + WS scenario
│   ├── check-system.sh               # Health monitoring during tests
│   └── README.md                     # Load testing documentation
│
├── tracking-service/                 # NestJS backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   └── src/
│       ├── main.ts                   # Application bootstrap (global filters)
│       ├── app.module.ts             # Root module with all imports
│       ├── adapters/
│       │   └── redis-io.adapter.ts   # Socket.io Redis adapter for multi-instance support
│       ├── common/
│       │   └── filters/
│       │       └── global-exception.filter.ts  # Consistent JSON error responses
│       ├── config/
│       │   ├── configuration.ts      # Centralized config (Kafka, DBs, Redis)
│       │   └── database.config.ts    # TypeORM connections + TimescaleDB/MySQL factories
│       ├── types/
│       │   └── pg.d.ts               # Type declarations for the 'pg' module
│       └── modules/
│           ├── auth/                 # JWT authentication, guards, refresh tokens
│           ├── kafka/                # Kafka producer & consumer (global) + DLQ service
│           ├── dlq/                  # DLQ admin (peek, replay, list topics)
│           ├── traccar/              # Webhook controller + ingestion service
│           ├── enrichment/           # GPS position enrichment
│           ├── sync/                 # CDC consumer + lag monitoring
│           ├── customers/            # 3-level customer cache
│           ├── drivers/              # Driver CRUD + position entity
│           ├── vehicles/             # Vehicle CRUD (plate, type, brand, model, capacity)
│           ├── routes/               # Delivery route management
│           ├── visits/               # Planned visit lifecycle
│           ├── websocket/            # Socket.io gateway with room-based broadcasting
│           ├── redis/                # Redis service (global, with geo operations)
│           ├── timescale/            # Time-series reads/writes
│           └── health/               # Health endpoints (Kafka, Redis, TimescaleDB, WebSocket)
│
└── fleetview-live-main/              # React frontend (Vite + Bun)
    ├── package.json
    ├── .env.example
    └── src/
        ├── components/
        │   ├── customers/            # CustomerDetailPanel, CreateCustomerDialog (map-pin)
        │   ├── dashboard/            # Map, workspace, driver panel/inbox, footer, controls
        │   ├── drivers/              # DriverDetailPanel, CreateDriverDialog
        │   ├── filters/              # FilterBar + useDatasetFilters (shared by directory & report tables)
        │   ├── history/              # Route playback, filter, detail, playback bar
        │   ├── layout/               # AppLayout, IconRail, CommandPalette, ProtectedRoute
        │   ├── monitoring/           # CDC lag monitoring (admin)
        │   ├── reports/              # ReportsHeader + tabs (Overview/Routes/Visits/Drivers/Vehicles/Customers)
        │   ├── routes/               # Route builder (sidebar, map, drag-and-drop, add-stop palette)
        │   ├── theme/                # ThemeProvider + toggle
        │   ├── vehicles/             # VehicleDetailPanel, Create/Edit dialogs
        │   └── ui/                   # shadcn primitives + project primitives:
        │                             #   table-shell, directory-detail-panel,
        │                             #   location-picker-map, date-range-picker, dense-form
        ├── hooks/                    # React Query hooks, useSocket, hotkeys, exporter
        │   └── api/                  # useDrivers, useVehicles, useRoutes, useRouteBuilder,
        │                             #   useHistory, useReports, useDriverDetail
        ├── pages/                    # Index, Login, History, Monitoring, Routes, Vehicles,
        │                             #   Drivers, Customers, Reports, Settings, NotFound
        ├── stores/                   # Zustand stores (auth, map, playback, routeBuilder, reports, dashboard)
        └── types/                    # TypeScript interfaces
```

---

## 📌 Prerequisites

- **Docker** and **Docker Compose** (v2+)
- **Node.js** v18+ and **npm** v9+
- ~6 GB of available RAM for Docker containers
- Available ports: `3000`, `3306`, `5002`, `5003`, `5432`, `5433`, `6379`, `8080`, `8082`, `8083`, `8090`, `9094`

---

## 🚀 Installation & Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd streaming-tracking-logistic
```

### 2. Configure environment variables

The `.env` file already includes default values for local development:

```dotenv
# MySQL (Source of Truth)
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_DATABASE=core_business
MYSQL_ROOT_PASSWORD=root_secret

# PostgreSQL Cache
CACHE_DB_HOST=cache-db
CACHE_DB_PORT=5432
CACHE_DB_NAME=tracking_cache
CACHE_DB_USER=tracking
CACHE_DB_PASSWORD=tracking_secret

# TimescaleDB
TIMESCALE_HOST=timescale
TIMESCALE_PORT=5433
TIMESCALE_DB=tracking_history
TIMESCALE_USER=timescale
TIMESCALE_PASSWORD=timescale_secret

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=redis_secret

# Kafka
KAFKA_BROKER=kafka:9092
KAFKA_EXTERNAL_PORT=9094

# App — deployment-default IANA timezone (tenant default + driver_daily_stats bucket tz)
DEFAULT_TZ=America/La_Paz
```

### 3. Start the infrastructure with Docker

```bash
# Start all infrastructure services
docker compose up -d

# Verify all containers are healthy
docker ps --format "table {{.Names}}\t{{.Status}}"
```

The following services will start:

| Container | Port(s) | Description |
|---|---|---|
| `traccar` | 8082, 5001 | Traccar GPS server |
| `traccar-db` | (internal) | Traccar PostgreSQL |
| `kafka` | 9094 (host) | Apache Kafka broker (KRaft) |
| `kafka-init` | — | Creates all 8 Kafka topics (runs once and exits) |
| `kafka-connect` | 8083 | Debezium Connect for CDC |
| `kafka-ui` | 8080 | Kafka monitoring UI |
| `mysql` | 3306 | Source of truth database |
| `cache-db` | 5432 | Local PostgreSQL cache |
| `timescale` | 5433 | TimescaleDB for historical data |
| `redis` | 6379 | Cache and pub/sub |
| `osrm` | 5003 | OSRM routing engine (La Paz road network) |
| `or-tools-solver` | 5002 | OR-Tools VRP solver (Python FastAPI) |
| `integration-service` | 8090 | NestJS microservice: Kafka commands → MySQL writes |

### 4. Set up OSRM (Route Optimization)

```bash
# Download Bolivia OSM data, clip La Paz region, and build OSRM graph
chmod +x infrastructure/osrm/setup.sh
./infrastructure/osrm/setup.sh
```

This downloads the Bolivia OSM extract from Geofabrik, clips it to the La Paz bounding box (`-69.65,-17.05,-67.0,-13.5`), and runs OSRM extract/partition/customize. The resulting graph files are stored in `infrastructure/osrm/data/`.

### 5. Apply route optimization migration & seed data

```bash
# Add optimization columns to routes and planned_visits tables
docker exec -i cache-db psql -U tracking -d tracking_cache \
  < infrastructure/cache-db/init/03-route-optimizer.sql

# Seed 23 La Paz customers with real coordinates
docker exec -i cache-db psql -U tracking -d tracking_cache \
  < infrastructure/cache-db/init/04-seed-customers-lapaz.sql

# Enforce one active route per driver per day (partial unique index).
# Fails if existing data double-books a driver — cancel/reassign the extras first.
docker exec -i cache-db psql -U tracking -d tracking_cache \
  < infrastructure/cache-db/init/06-routes-unique-driver-date.sql
```

> **Existing databases only** (fresh installs get these from the init scripts):
> ```bash
> # Settings tables (tenant_settings + user_settings) and tenant-default seed
> docker exec -i cache-db psql -U tracking -d tracking_cache \
>   < infrastructure/cache-db/init/08-settings.sql
>
> # Subscription plans + per-tenant subscriptions (SaaS control plane) and plan catalog seed
> docker exec -i cache-db psql -U tracking -d tracking_cache \
>   < infrastructure/cache-db/init/11-subscriptions.sql
>
> # Rebuild driver_daily_stats to bucket in the deployment timezone (DEFAULT_TZ)
> docker exec -i timescale psql -U timescale -d tracking_history \
>   < scripts/migrate-daily-stats-tz.sql
> ```

### 6. Register the Debezium CDC connector

```bash
# Wait for Kafka Connect to be ready, then register the connector
bash scripts/register-cdc-connector.sh
```

This configures Debezium to capture changes from the `accounts`, `customers`, `products`, and `orders` MySQL tables and publish them to the `cdc.*` Kafka topics.

The script upserts the connector config via `PUT …/connectors/mysql-cdc-v4/config`, so it is **idempotent** — re-running it on an already-registered connector updates it in place and exits 0 (no `409 Conflict`). Without this connector running, integrated-mode reads stay empty: writes reach MySQL but never sync to the PostgreSQL cache. Verify with `curl -s localhost:8083/connectors/mysql-cdc-v4/status` (expect `connector.state` and the task both `RUNNING`).

### 7. Install NestJS service dependencies

```bash
cd tracking-service
npm install
```

### 8. Install and run the frontend

```bash
cd fleetview-live-main

# Copy environment template
cp .env.example .env

# Install dependencies (using Bun or npm)
bun install
# or: npm install

# Start development server
bun dev
# or: npm run dev
```

The frontend will be available at `http://localhost:5173`.

---

## ▶️ Running the Application

### Local development (recommended)

```bash
# Make sure the Docker infrastructure is running
docker compose up -d

# Stop the Docker tracking-service container (if it exists)
docker compose stop tracking-service

# Run NestJS in development mode with hot-reload
cd tracking-service
npm run start:dev
```

The tracking service will be available at `http://localhost:3000`.

The **integration-service** (NestJS, in `integration-service-nest/`) runs as a Docker container and starts automatically with `docker compose up -d`. It consumes `commands.customers` from Kafka and writes to MySQL. (Its `commands.drivers` handler is kept **dormant** — drivers are now PostgreSQL-owned and written directly by `tracking-service`.) To verify it is running:

```bash
curl http://localhost:8090/healthz
# {"status":"ok","service":"integration-service"}
```

If you need to rebuild it after code changes:

```bash
docker compose build integration-service
docker compose up -d integration-service
```

### Verify system health

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-07T06:20:00.000Z",
  "services": {
    "kafka": "up",
    "redis": "up",
    "timescale": "up"
  },
  "websocket": {
    "connectedClients": 0,
    "activeRooms": 0
  }
}
```

### Useful web interfaces

| Tool | URL | Description |
|---|---|---|
| Frontend | http://localhost:5173 | React dashboard (login: admin@tenant1.com / admin123) |
| Kafka UI | http://localhost:8080 | Topic, consumer, and connector monitoring |
| Traccar | http://localhost:8082 | Traccar administration interface |
| Integration Service | http://localhost:8090/healthz | Integration service health check |

---

## 🔄 Data Flows

### GPS Position Flow

```
GPS Device → Traccar → HTTP Webhook → NestJS (TraccarController)
    → Kafka [gps.positions]
    → EnrichmentService (consume + enrich with business data)
    → Parallel fan-out:
        ├── Redis (latest position per driver, TTL 5 min)
        ├── PostgreSQL cache (driver_positions snapshot, upsert)
        ├── TimescaleDB (enriched_positions history)
        └── Kafka [gps.positions.enriched]
```

### Command Write Flow (Customer creation)

```
POST /api/customers
    → NestJS produces to Kafka [commands.customers]
    → HTTP 202 Accepted { correlationId }
    → Integration Service (NestJS) consumes command
        ├── INSERT into MySQL (with 3× retry + exponential backoff)
        └── On failure → DLQ (commands.customers.dlq)
    → Debezium captures MySQL change → cdc.customers
    → CdcConsumerService syncs to PostgreSQL cache
```

> **Drivers do NOT use this flow.** Drivers are PostgreSQL-owned: `POST /api/drivers`
> writes the `drivers` table directly and returns **`201 Created`** with the driver
> (synchronous, no Kafka, no MySQL, no CDC). `DriversService` updates the enrichment
> device→driver map itself. The `integration-service` `DriversHandler` and the
> `commands.drivers`/`cdc.drivers` topics are retired/dormant — see the Drivers module below.

### CDC Sync Flow (MySQL → Local Cache)

```
MySQL (INSERT/UPDATE/DELETE) → Binlog
    → Debezium captures changes
    → Kafka [cdc.accounts, cdc.customers, cdc.products, cdc.orders]
    → NestJS CdcConsumerService
        ├── Upsert/Delete in PostgreSQL cache
        ├── Invalidate Redis cache
        └── Update sync_state
```

### 3-Level Cache (Customer Reads)

```
Request → Level 1: In-process Memory (Map, TTL 60s)
    │ miss
    ▼
Level 2: Redis (TTL 5 min)
    │ miss
    ▼
Level 3: Local PostgreSQL cache (always fresh via CDC)
    │ miss (rare)
    ▼
Fallback: Direct MySQL query
```

### Visit Lifecycle

```
1. Create planned visit (POST /api/visits)
2. Driver approaches customer geofence → Auto-arrival detection
3. Visit: pending → arrived → in_progress → completed
4. Events published to Kafka [visits.events]
5. History stored in TimescaleDB (visit_completions)
```

---

## 📦 NestJS Service Modules

### `kafka/` — Kafka Producer & Consumer
- **KafkaProducerService**: Produces individual and batch messages to any topic.
- **KafkaConsumerService**: Registers handlers per topic with `fromBeginning` option. Manages a single consumer with multiple subscriptions.

### `traccar/` — GPS Data Ingestion + Device Provisioning
- **TraccarController**: Receives positions and events via HTTP webhook from Traccar.
- **TraccarIngestionService**: Publishes raw positions to `gps.positions` and events to `gps.events`.
- **Device auto-provisioning (outbound)**: Traccar only accepts positions for devices that already exist (keyed by `uniqueId`), where `uniqueId === driver.device_id`. The control plane creates/syncs that Traccar device automatically when a device is assigned to a driver — no manual step in the Traccar UI. `TraccarAdminService` (native-`fetch` REST client + Basic auth, wrapped in an **opossum circuit breaker**) does device CRUD; `TraccarProvisioningService` enqueues `ensure`/`disable` jobs on a **BullMQ** queue (`traccar-sync`, on the shared Redis, retry + exponential backoff) consumed by `TraccarSyncProcessor`. `DriversService` enqueues on create / update / pair-device / deactivate. Driver CRUD never blocks on Traccar (jobs are async and self-healing); on deactivate/unpair the device is **disabled, not deleted** (re-enabled on re-pair). Config via `TRACCAR_URL` / `TRACCAR_ADMIN_EMAIL` / `TRACCAR_ADMIN_PASSWORD`; set `TRACCAR_PROVISIONING_ENABLED=false` to disable. The device side (Traccar Client / future driver app) only needs to send positions with the assigned `uniqueId`.

### `enrichment/` — Position Enrichment
- **EnrichmentService**: Consumes `gps.positions`, joins with driver/route/visit/customer data, calculates distance and ETA to next destination, detects geofence entry, triggers automatic arrivals.
- **geo-utils.ts**: Utility functions (Haversine distance, ETA estimation, geofence detection).

### `sync/` — CDC Synchronization
- **CdcConsumerService**: Consumes `cdc.*` topics, maps Debezium fields, performs upsert/delete on local cache, updates `sync_state`.
- **SyncController**: Endpoints to query sync status and cached data.

### `customers/` — Customer Cache
- **CustomerCacheService**: Implements 3-level cache (Memory → Redis → PG → MySQL fallback). Supports lookup by ID, by tenant, and geo queries.

### `drivers/` — Driver Management
- **DriversService/Controller**: Drivers are **PostgreSQL-owned** (source of truth) — writes go directly to the `drivers` table, no Kafka/MySQL/CDC. Create (`201`), update, soft-deactivate (`DELETE` → `status='inactive'` + clears device), and device pairing (`PATCH /drivers/:id/device`). `DriversService` keeps the enrichment device→driver map current via `refreshDriverMapping`/`removeDriverMapping`, and **auto-provisions the matching Traccar device** on assign/pair (see `traccar/`). A global partial-unique index `uq_drivers_device_id` prevents two drivers sharing a device. (The `integration-service` `DriversHandler` is kept dormant for a future gated MySQL→PG inbound-sync.)
- **Driver vs. login are separate**: a driver record is operational and has no credentials. To let a driver sign in, an admin/dispatcher provisions a login: `POST /api/drivers/:id/login` `{email, password}` creates a `role:'driver'` user linked via `driverId` (tenant taken from the admin's JWT, not the body; one login per driver — `409` if it already exists). `GET /api/drivers` returns `hasLogin` per row; the dashboard shows a "Create login" action / "Has login" badge accordingly. The driver then logs in with email + password + workspace; the JWT carries `driverId` for driver-scoped access (own visits, self-pair). The web dashboard is admin/dispatcher-oriented — a `role:'driver'` login only sees Live/History/Settings; the full driver experience is the planned companion app.
- **DriverPosition**: Snapshot entity of the latest known position per driver.

### `vehicles/` — Vehicle Management
- **VehiclesService/Controller**: Full CRUD for fleet vehicles. Create, list, search (by plate, type, status, brand, driver), update. Stored directly in the local PostgreSQL cache.
- **Vehicle**: Entity with plate, type, brand, model, year, color, capacity (kg), status (active/maintenance/inactive), and optional driver assignment.

### `routes/` — Delivery Routes
- **RoutesService/Controller**: Create, list, update routes. Find active and today's routes by driver. Completed stop counter. Date range filtering with optional status filter.
- **RouteOptimizerService**: Orchestrates route optimization — fetches OSRM distance/duration matrix, sends to OR-Tools VRP solver, updates visit sequence, ETAs, and distances.

### `history/` — Historical Reports
- **HistoryController**: Exposes filtered queries over TimescaleDB data for reporting. Visit completions with driver/date filters and daily driver statistics. `from`/`to` are interpreted as UTC instants — the dashboard converts the user's civil-day range to UTC using their timezone before calling, so report boundaries reflect the user's local day rather than a UTC day.

### `settings/` — User & Tenant Preferences
- **SettingsService/Controller**: Tenant-default + per-user preferences (timezone, locale, date/number format, units, default report range, theme, density). Stored in `tenant_settings` / `user_settings` — **owned tables written directly to the PG cache** (not synced from MySQL). `getEffective()` resolves `user override → tenant default → system default`. Effective settings are also returned on login and `/api/auth/profile`.

### `subscriptions/` — Plans & Entitlements (SaaS control plane)
- **EntitlementsService**: Resolves a tenant's plan + subscription into concrete entitlements and enforces the plan limits. **PG-owned** tables `subscription_plans` (catalog) + `tenant_subscriptions` (one row/tenant), written directly to the cache (not CDC) — so a standalone tenant works with no Kafka/CDC alive. A tenant with no subscription row falls back to free Starter defaults. Gates wired in:
  - **Seat cap** — `assertCanAddDriver` in `DriversService.create` returns **402** when active drivers (`status <> 'inactive'`) reach `COALESCE(seats_purchased, plan.max_drivers)`.
  - **Integration upsell** — `assertCanIntegrate` blocks flipping `tenant_settings.ingest_mode` to `integrated` (via `PUT /api/tenant/settings`) unless the plan's `integration_allowed` is set (**403**).
  - **Feature gating** — `@RequiresFeature` + `FeatureGuard` gate `POST /api/routes/:id/optimize` (`route_optimization`) and the reports endpoints `GET /api/history/{stats,visits}` (`reports`) (**403** when absent).
- **SubscriptionsController**: `GET /api/me/entitlements` (frontend feature flags — the dashboard hides/disables gated UI from this) and `GET /api/tenant/subscription` (admin).
- **Billing lifecycle (Stripe)**: `SubscriptionLifecycleService` owns the write side. A 14-day reverse trial auto-starts on owner signup (`AuthService.register`, `role: 'admin'`, idempotent). `POST /api/subscriptions/checkout` opens a Stripe Checkout session (creates the customer, seats = active-driver count) to add a card and convert; `POST /api/subscriptions/portal` opens the Billing Portal; `POST /api/subscriptions/trial/start` (admin). A daily cron downgrades lapsed, un-converted trials to free Starter. `StripeService` wraps the SDK; `BillingService` consumes the webhook `POST /api/subscriptions/webhook` (public, signature-verified against the raw body) and projects `checkout.session.completed`, `customer.subscription.*`, and `invoice.paid|payment_failed` onto `tenant_subscriptions`. Stripe is optional — with `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` unset, billing endpoints return 503/400. Going fully live also needs real Stripe Prices mapped via `subscription_plans.stripe_price_id`.

### `visits/` — Planned Visits
- **VisitsService/Controller**: Create visits, manage lifecycle (`pending` → `arrived` → `in_progress` → `completed` → `departed`), automatic arrival/departure, event publishing, delete pending visits.

### `redis/` — Redis Service (Global)
- **RedisService**: ioredis wrapper with operations: get/set, hashes, geo (GEOADD, GEODIST, GEORADIUS), pub/sub, health check.

### `timescale/` — Time Series
- **TimescaleService**: Direct pg Pool connection (not TypeORM). Inserts enriched positions, visit completions. Queries history by driver, route, and daily statistics.

### `websocket/` — Real-Time WebSocket Gateway
- **TrackingGateway**: Socket.io gateway with room-based broadcasting (`tenant:{id}`, `driver:{id}`, `route:{id}`). Emits `position:update` and `visit:update` events.
- **WsBroadcastService**: Kafka→WebSocket bridge. Consumes `gps.positions.enriched` and `visits.events` topics and broadcasts to connected clients.
- **RedisIoAdapter**: Custom Socket.io adapter using Redis pub/sub for horizontal scaling across multiple NestJS instances.

### `health/` — Health Endpoints
- **HealthController**: `GET /api/health` checks connectivity with Kafka, Redis, TimescaleDB, and WebSocket stats. Includes DLQ message counts and degradation status. `GET /api/health/ready` for readiness probes.

### `dlq/` — Dead Letter Queue Admin
- **DlqAdminService**: Inspects DLQ Kafka topics — list topics, peek at messages, replay messages back to original topics.
- **DlqController**: Admin-only REST endpoints for DLQ management (`/api/dlq/*`).

### `common/filters/` — Global Filters
- **GlobalExceptionFilter**: Catches all exceptions and returns consistent JSON error responses with timestamp and path. Logs 5xx errors with stack traces.

---

## 📡 REST API

### Authentication

The API uses JWT-based authentication with role-based access control.

#### Auth Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Authenticate and get tokens |
| POST | `/api/auth/refresh` | Public | Refresh access token |
| POST | `/api/auth/register` | Admin | Create new user |
| POST | `/api/auth/logout` | Authenticated | Invalidate refresh token |
| GET | `/api/auth/profile` | Authenticated | Get current user info |

#### Login Flow

```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tenant1.com",
    "password": "admin123",
    "tenantId": "tenant-1"
  }'

# Response:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "uuid-v4-token",
  "expiresIn": "15m",
  "user": {
    "id": "admin-tenant-1",
    "email": "admin@tenant1.com",
    "name": "Admin User",
    "role": "admin",
    "tenantId": "tenant-1"
  }
}

# 2. Use access token for authenticated requests
curl -X GET http://localhost:3000/api/drivers \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

# 3. Refresh token when needed
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{ "refreshToken": "uuid-v4-token" }'
```

#### Roles & Permissions

| Role | Description | Permissions |
|---|---|---|
| `admin` | System administrator | All operations, user management, sync access |
| `dispatcher` | Route planner | View/edit routes, visits, drivers (own tenant) |
| `driver` | Delivery driver | View own routes and visits, update visit status |

#### Default Users

| Email | Password | Tenant | Role |
|---|---|---|---|
| `admin@tenant1.com` | `admin123` | tenant-1 | admin |
| `admin@tenant2.com` | `admin123` | tenant-2 | admin |

#### Environment Variables

```bash
JWT_SECRET=change-me-in-production-please
JWT_EXPIRES_IN=15m
REFRESH_EXPIRES_IN=7d
TRACCAR_API_KEY=traccar-shared-key
# Traccar admin REST client (device auto-provisioning). Local default :8082.
TRACCAR_URL=http://localhost:8082
TRACCAR_ADMIN_EMAIL=admin@example.com
TRACCAR_ADMIN_PASSWORD=admin
TRACCAR_PROVISIONING_ENABLED=true
```

### Health

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Overall service status |
| GET | `/api/health/ready` | Readiness check |

### Traccar (Webhook)

**Authentication**: API Key (header `X-API-Key`)

| Method | Route | Description |
|---|---|---|
| POST | `/api/traccar/positions` | Receive positions from Traccar |
| POST | `/api/traccar/events` | Receive events from Traccar |

### Drivers

| Method | Route | Description |
|---|---|---|
| GET | `/api/drivers` | List all drivers |
| GET | `/api/drivers/:id` | Get driver by ID |
| POST | `/api/drivers` | Create driver (direct PG write, returns `201`) |
| PATCH | `/api/drivers/:id` | Update driver |
| DELETE | `/api/drivers/:id` | Soft-deactivate driver (`status='inactive'`, clears device) |
| PATCH | `/api/drivers/:id/device` | Pair/unpair a device (`deviceId`); managers or the driver themselves |
| GET | `/api/drivers/:id/history?from=&to=` | Driver position history (TimescaleDB) |

### Routes

| Method | Route | Description |
|---|---|---|
| POST | `/api/routes` | Create route |
| GET | `/api/routes` | List routes (supports `?from=&to=&status=` date range filter) |
| GET | `/api/routes/:id` | Get route with visits |
| PATCH | `/api/routes/:id` | Update route (e.g. change status) |
| GET | `/api/routes/driver/:driverId/active` | Driver's active route |
| GET | `/api/routes/driver/:driverId/today` | Driver's routes for today |
| GET | `/api/routes/:id/history?from=&to=` | Route position history (TimescaleDB) |
| POST | `/api/routes/:id/optimize` | Optimize visit order using OSRM + OR-Tools |
| PATCH | `/api/routes/:id/reorder` | Manually reorder visits (drag-and-drop) |

### Vehicles

| Method | Route | Description |
|---|---|---|
| POST | `/api/vehicles` | Create a new vehicle |
| GET | `/api/vehicles` | List all vehicles (filtered by tenant) |
| GET | `/api/vehicles/search?plate=&type=&status=&driverId=&brand=` | Search vehicles by criteria |
| GET | `/api/vehicles/:id` | Get vehicle by ID |
| PATCH | `/api/vehicles/:id` | Update vehicle info |

### Customers

| Method | Route | Description |
|---|---|---|
| GET | `/api/customers` | List all customers (filtered by tenant) |

### Visits

| Method | Route | Description |
|---|---|---|
| POST | `/api/visits` | Create planned visit |
| GET | `/api/visits/:id` | Get visit by ID |
| GET | `/api/visits/route/:routeId` | Visits for a route |
| GET | `/api/visits/driver/:driverId` | Visits for a driver |
| PATCH | `/api/visits/:id/status` | Update visit status |
| DELETE | `/api/visits/:id` | Delete a pending visit |

### History (Reports)

| Method | Route | Description |
|---|---|---|
| GET | `/api/history/visits?from=&to=&driverId=` | Visit completions (filterable by driver) |
| GET | `/api/history/stats?from=&to=` | Daily driver statistics (speed, positions, moving ratio) |

> `from`/`to` accept a date-only `yyyy-mm-dd` **or** a full UTC ISO instant. The dashboard sends UTC instants derived from the user's timezone so a "day" means their civil day. `driver_daily_stats` is bucketed in the deployment timezone (`DEFAULT_TZ`).

### Settings

| Method | Route | Description |
|---|---|---|
| GET | `/api/me/settings` | Current user's effective settings + raw user/tenant layers |
| PUT | `/api/me/settings` | Update the current user's overrides (timezone, locale, units, theme, …) |
| GET | `/api/tenant/settings` | Tenant defaults (admin only) |
| PUT | `/api/tenant/settings` | Update tenant defaults (admin only) |

### CDC Sync

| Method | Route | Description |
|---|---|---|
| GET | `/api/sync/status` | Sync status by table |
| GET | `/api/sync/accounts` | Cached accounts |
| GET | `/api/sync/accounts/:id` | Account by ID |
| GET | `/api/sync/customers` | Cached customers |
| GET | `/api/sync/customers/:id` | Customer by ID |
| GET | `/api/sync/products` | Cached products |
| GET | `/api/sync/products/:id` | Product by ID |
| GET | `/api/sync/orders` | Cached orders |
| GET | `/api/sync/orders/:id` | Order by ID |
| GET | `/api/sync/lag` | CDC lag metrics (admin only) |

### Dead Letter Queue (Admin only)

| Method | Route | Description |
|---|---|---|
| GET | `/api/dlq/topics` | List all DLQ topics with message counts |
| GET | `/api/dlq/:topic/messages?limit=20` | Peek at DLQ messages |
| POST | `/api/dlq/:topic/replay?limit=100` | Replay DLQ messages to original topics |

**DLQ Topics:**
- `gps.positions.dlq` — Failed raw position enrichments
- `gps.positions.enriched.dlq` — Failed WebSocket broadcasts
- `visits.events.dlq` — Failed visit event broadcasts
- `cdc.dlq` — Failed CDC sync messages (shared across all CDC topics)

**DLQ Message Headers:**

| Header | Description |
|---|---|
| `x-original-topic` | The topic the message originally came from |
| `x-error-message` | Error description |
| `x-error-stack` | Error stack trace (truncated to 1000 chars) |
| `x-retry-count` | Number of retry attempts before DLQ |
| `x-failed-at` | ISO timestamp of when the message was sent to DLQ |
| `x-original-partition` | Original partition number |
| `x-original-offset` | Original message offset |

---

## 🌐 WebSocket API

### Connection

Connect to the WebSocket server at the `/tracking` namespace with JWT authentication:

```javascript
// After successful login, use the access token
const socket = io('http://localhost:3000/tracking', {
  auth: {
    token: accessToken  // JWT token from /api/auth/login
  }
});

// Handle authentication errors
socket.on('error', (error) => {
  console.error('WebSocket auth error:', error.message);
  // Refresh token and reconnect
});

// Connection is authenticated and auto-joined to tenant room
socket.on('connect', () => {
  console.log('Connected to tracking server');
});
```

**Note**: The WebSocket gateway verifies JWT tokens on connection. Users are automatically joined to their tenant room based on their token. Drivers can only join their own driver rooms; admin/dispatcher can join any.

### Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `join-tenant` | `{ tenantId: string }` | Join room to receive all updates for a tenant |
| `join-driver` | `{ driverId: string }` | Join room to receive updates for a specific driver |
| `join-route` | `{ routeId: string }` | Join room to receive updates for a specific route |
| `leave-tenant` | `{ tenantId: string }` | Leave tenant room |
| `leave-driver` | `{ driverId: string }` | Leave driver room |
| `leave-route` | `{ routeId: string }` | Leave route room |
| `get-active-drivers` | — | Request list of currently tracked drivers |

### Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `position:update` | `EnrichedPosition` | Real-time GPS position with enriched data |
| `visit:update` | `VisitEvent` | Visit lifecycle event (arrival, completion, etc.) |
| `cdc:lag` | `CdcLagSnapshot` | CDC lag metrics broadcast every 5s (admin only) |
| `error` | `{ message: string }` | Error notification |

### Room Conventions

- **Tenant rooms**: `tenant:{tenantId}` — Receive all updates for drivers in a tenant
- **Driver rooms**: `driver:{driverId}` — Receive updates for a specific driver
- **Route rooms**: `route:{routeId}` — Receive updates for all drivers on a route

Clients can join multiple rooms simultaneously to customize their data feed.

### Example Client

```javascript
const { io } = require('socket.io-client');

const socket = io('http://localhost:3000/tracking');

socket.on('connect', () => {
  console.log('Connected to tracking server');
  
  // Join tenant room to see all drivers
  socket.emit('join-tenant', { tenantId: 'tenant-1' });
  
  // Or join specific driver room
  socket.emit('join-driver', { driverId: 'a1b2c3d4-0001-4000-8000-000000000001' });
});

socket.on('position:update', (position) => {
  console.log('Driver position:', position);
  // Update map marker, calculate ETA, etc.
});

socket.on('visit:update', (event) => {
  console.log('Visit event:', event);
  // Update visit status in UI
});

socket.on('disconnect', () => {
  console.log('Disconnected from tracking server');
});
```

---

## � CDC Lag Monitoring

Real-time monitoring of the delay between MySQL source changes and their arrival in the PostgreSQL cache.

### REST Endpoint

`GET /api/sync/lag` — Returns `CdcLagSnapshot` with per-table lag metrics, Kafka offset lag, and totals. Admin-only.

### WebSocket Event

`cdc:lag` — Broadcasted every 5 seconds to the `role:admin` room. Same payload as the REST endpoint.

### Health Integration

`GET /api/health` includes a `cdc` section with lag status:

| Lag | Status |
|---|---|
| < 2 seconds | `healthy` (green) |
| 2–5 seconds | `warning` (yellow) |
| 5–10 seconds | `degraded` (orange) |
| > 10 seconds | `critical` (red) |

### Frontend

Admin users can access the monitoring page at `/monitoring` from the dashboard header. It displays:

- **Per-table lag cards** — Current lag, events processed, error count, sparkline chart
- **Kafka offset lag table** — Per-topic/partition pending messages
- **Summary bar** — Total events, errors, max/avg lag, uptime

---

## �📨 Kafka Topics

| Topic | Partitions | Producer | Consumer | Purpose |
|---|---|---|---|---|
| `gps.positions` | 6 | TraccarIngestionService | EnrichmentService | Raw GPS positions |
| `gps.positions.enriched` | 6 | EnrichmentService | WsBroadcastService | Enriched positions |
| `gps.events` | 3 | TraccarIngestionService | (to be implemented) | Traccar events |
| `visits.events` | 3 | VisitsService | WsBroadcastService | Visit lifecycle events |
| `cdc.accounts` | 3 | Debezium | CdcConsumerService | Account changes |
| `cdc.customers` | 3 | Debezium | CdcConsumerService | Customer changes |
| `cdc.products` | 3 | Debezium | CdcConsumerService | Product changes |
| `cdc.orders` | 3 | Debezium | CdcConsumerService | Order changes |
| `gps.positions.dlq` | 3 | DlqService | DlqAdminService | Failed raw position enrichments |
| `gps.positions.enriched.dlq` | 3 | DlqService | DlqAdminService | Failed WebSocket broadcasts |
| `visits.events.dlq` | 3 | DlqService | DlqAdminService | Failed visit event broadcasts |
| `cdc.dlq` | 3 | DlqService | DlqAdminService | Failed CDC sync messages (all CDC topics) |

---

## 🗄 Database Schemas

### MySQL — Source of Truth (`core_business`)

- `accounts` — Accounts/companies (id, tenant_id, name, account_type, settings)
- `customers` — Customers with geographic location (lat, lng, geofence_radius)
- `products` — Product catalog
- `orders` — Orders

> **Note:** `users` are **not** in MySQL. They are owned directly by `tracking_cache` (see below) — the auth module reads and writes them in PostgreSQL, with no CDC loop.

### PostgreSQL Cache (`tracking_cache`)

**Tables synced via CDC (read-only):**
- `accounts_cache`, `customers_cache`, `products_cache`

**Tracking service owned tables:**
- `cached_users` — User accounts with roles (admin, dispatcher, driver). **Source of truth**, written directly by the auth module (login/register), not synced from MySQL; seeded with admin accounts in `02-cached-users.sql`
- `drivers` — Drivers (device_id links to Traccar)
- `vehicles` — Fleet vehicles (plate, type, brand, model, year, color, capacity_kg, status, optional driver_id FK)
- `tenant_settings`, `user_settings` — Tenant-default + per-user preferences (timezone, locale, units, theme, …), written directly (not CDC)
- `subscription_plans`, `tenant_subscriptions` — SaaS control plane: plan catalog + per-tenant subscription. Gates seats/features/the integration upsell (see the `subscriptions/` module); PG-owned so it works with no Kafka/CDC
- `routes` — Planned delivery routes (+ `total_distance_meters`, `total_estimated_seconds`, `optimized_at`, `optimization_method`)
- `planned_visits` — Stops within a route (+ `estimated_arrival_time`, `estimated_travel_seconds`, `estimated_distance_meters`)
- `driver_positions` — Latest position snapshot per driver
- `sync_state` — CDC sync status

### TimescaleDB (`tracking_history`)

**Hypertables:**
- `enriched_positions` — Enriched position history (partitioned by day, compression after 7 days, 365-day retention)
- `visit_completions` — Completed visit records for analytics

**Continuous Aggregates:**
- `driver_daily_stats` — Daily statistics per driver (avg/max speed, moving percentage, visit count)

---

## 🧩 Design Patterns

| Pattern | Implementation |
|---|---|
| **Webhook Ingestion** | Traccar forwards positions via HTTP to the service |
| **Event-Driven Enrichment** | Consume raw → enrich → produce enriched (via Kafka) |
| **CDC (Change Data Capture)** | Debezium captures MySQL changes → Kafka → local cache |
| **3-Level Cache** | Memory (60s) → Redis (5min) → Local PG → MySQL (fallback) |
| **Parallel Fan-out** | Each enriched position is simultaneously written to Redis, PG, TimescaleDB, and Kafka |
| **Geofence Detection** | Haversine calculation to detect entry/exit from customer perimeter |
| **Automatic Arrival** | If the driver enters the next visit's geofence, it is automatically marked as `arrived` |
| **Upsert on Conflict** | driver_positions uses `ON CONFLICT DO UPDATE` for an always-current snapshot |
| **Multi-tenancy** | `tenant_id` present in all entities, queries filtered by tenant |
| **Route Optimization** | OSRM distance matrix → OR-Tools VRP solver → optimal visit sequence with ETAs |
| **Sidecar Pattern** | OR-Tools Python solver runs as a separate FastAPI microservice |
| **Dead Letter Queue** | Failed messages retried with exponential backoff → DLQ Kafka topics for inspection/replay |
| **Global Exception Filter** | Consistent JSON error responses across all REST endpoints |
| **I18n (Bilingual)** | `react-i18next` on the frontend, `nestjs-i18n` on the backend. Locale resolves from `Accept-Language` (also `?lang=` and `x-lang`). Spanish is the default; English is opt-in via the icon-rail Languages toggle. |

---

## 🌐 Internationalization

The dashboard and backend are bilingual (**Spanish default**, English opt-in). The icon-rail Languages toggle persists the user's choice in `localStorage` (`fleetview.language`), and the axios client sends `Accept-Language` on every request so backend errors come back in the same language.

### Frontend (`fleetview-live-main/src/i18n/`)

- Bootstrapped in `src/main.tsx` via `src/i18n/index.ts` using `i18next` + `react-i18next` + `i18next-browser-languagedetector`.
- Twelve namespaces, one JSON file per language: `common`, `nav`, `auth`, `dashboard`, `routes`, `reports`, `drivers`, `vehicles`, `customers`, `history`, `monitoring`, `errors`.
- Consume in any component: `const { t } = useTranslation('routes'); t('sidebar.actions.optimize')`.
- Date formatting: `useDateLocale()` (from `src/i18n/useDateLocale.ts`) returns the matching `date-fns` locale — pass it to `format(date, 'd MMM', { locale })`.
- Number formatting: pass `i18n.language` to `toLocaleString()` / `toLocaleTimeString()` / `toLocaleDateString()`.

**To add a translation key:** add the same path to both `src/i18n/locales/es/<ns>.json` and `src/i18n/locales/en/<ns>.json`, then reference it as `t('<key>')`.

### Backend (`tracking-service/src/i18n/`)

- `AppI18nModule` (registered in `app.module.ts`) wraps `I18nModule.forRoot` with `fallbackLanguage: 'es'`, resolvers in priority order `?lang=` → `Accept-Language` → `x-lang`, and the JSON loader pointed at `src/i18n/` (copied to `dist/i18n/` on build via `nest-cli.json` assets).
- Two namespaces per language: `errors.json` (business + auth + validation domains) and `validation.json` (class-validator constraint names like `isEmail`, `isNotEmpty`, `minLength`).
- DTO validation messages are auto-localized: `main.ts` registers `I18nValidationPipe` + `I18nValidationExceptionFilter`, so a DTO using a bare `@IsEmail()` decorator produces a message resolved from `validation.isEmail` in the request's language.
- Business exceptions throw with an `errorCode`:

  ```ts
  throw new BadRequestException({ errorCode: 'routes.notFound', args: { id } });
  ```

  `GlobalExceptionFilter` (`src/common/filters/global-exception.filter.ts`) reads the language from `I18nContext` and resolves `errors.<errorCode>` with the `args` as ICU-style `{{placeholder}}` substitutions.

**To add a translation key:** add the same path to both `src/i18n/es/errors.json` and `src/i18n/en/errors.json`, then throw with `{ errorCode: 'group.key', args }`.

### Frontend ↔ backend error contract

Every error response now carries an `errorCode` so the frontend can re-translate client-side even if `Accept-Language` was stale at request time:

```jsonc
// 401 Unauthorized — bad login under Accept-Language: es
{
  "statusCode": 401,
  "errorCode": "auth.invalidCredentials",
  "message": "Credenciales inválidas",
  "error": "Unauthorized",
  "timestamp": "2026-05-31T10:23:14.182Z",
  "path": "/api/auth/login"
}
```

The frontend's `src/lib/apiError.ts` `translateApiError()` helper inspects `error.response.data.errorCode` first, falls back to the server's `message`, then to the caller's locally-translated fallback. Toast call sites pass this helper to `toast.error(...)` so users always see a localized message.

---

## 🧪 Manual Testing

### Verify CDC synchronization

```bash
# Check sync status
curl -s http://localhost:3000/api/sync/status | python3 -m json.tool

# View synced customers
curl -s http://localhost:3000/api/sync/customers | python3 -m json.tool

# Modify data in MySQL and verify it propagates
docker exec -it mysql mysql -uroot -proot_secret core_business \
  -e "UPDATE accounts SET name = 'New Name' WHERE id = 1;"

# Verify update in cache (should reflect the change in ~2s)
curl -s http://localhost:3000/api/sync/accounts | python3 -m json.tool
```

### Simulate a GPS position

```bash
# Send a position near the "Downtown Warehouse" customer (40.7128, -74.006)
curl -s -X POST http://localhost:3000/api/traccar/positions \
  -H "Content-Type: application/json" \
  -d '[{
    "id": 1,
    "deviceId": 1001,
    "protocol": "osmand",
    "serverTime": "2026-02-07T12:00:00.000Z",
    "deviceTime": "2026-02-07T12:00:00.000Z",
    "fixTime": "2026-02-07T12:00:00.000Z",
    "valid": true,
    "latitude": 40.7130,
    "longitude": -74.0055,
    "altitude": 10,
    "speed": 5,
    "course": 90,
    "accuracy": 10,
    "attributes": { "uniqueId": "DEV001" }
  }]'
```

### Create a full route and visit

```bash
# 1. Create a route for driver John Smith
curl -s -X POST http://localhost:3000/api/routes \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant-1",
    "driverId": "a1b2c3d4-0001-4000-8000-000000000001",
    "scheduledDate": "2026-02-07"
  }' | python3 -m json.tool

# 2. Activate the route (replace ROUTE_ID)
curl -s -X PATCH http://localhost:3000/api/routes/ROUTE_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'

# 3. Create a planned visit to Downtown Warehouse
curl -s -X POST http://localhost:3000/api/visits \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant-1",
    "routeId": "ROUTE_ID",
    "driverId": "a1b2c3d4-0001-4000-8000-000000000001",
    "customerId": 1,
    "sequenceNumber": 1,
    "visitType": "delivery",
    "scheduledDate": "2026-02-07",
    "timeWindowStart": "08:00",
    "timeWindowEnd": "12:00"
  }' | python3 -m json.tool

# 4. Send a GPS position inside the geofence → auto-arrival
# (see "Simulate a GPS position" above)
```

### Verify data in TimescaleDB

```bash
docker exec timescale psql -U timescale -d tracking_history \
  -c "SELECT time, driver_id, latitude, longitude, speed, customer_name, distance_to_next_m
      FROM enriched_positions ORDER BY time DESC LIMIT 5;"
```

### Verify data in Redis

```bash
# Latest driver position
docker exec redis redis-cli -a redis_secret \
  GET "pos:driver:a1b2c3d4-0001-4000-8000-000000000001"

# Driver geographic positions
docker exec redis redis-cli -a redis_secret \
  GEOPOS "geo:drivers" "a1b2c3d4-0001-4000-8000-000000000001"
```

---

## 🏋️ Load Testing

The project includes **k6** load testing scripts to validate system performance under realistic conditions.

### Prerequisites

- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) installed
- All Docker Compose services running
- Load test drivers seeded (directly into the PG cache; restart `tracking-service` afterward so the enrichment map loads them): `docker exec -i cache-db psql -U tracking -d tracking_cache < scripts/seed-load-test-drivers.sql`

### Test Scripts

| Script | VUs | Description |
|---|---|---|
| `load-tests/gps-ingestion.js` | 1,000 | Simulates 1,000 GPS devices sending positions via Traccar webhook |
| `load-tests/ws-consumers.js` | 500 | Simulates 500 concurrent WebSocket dashboard connections |
| `load-tests/full-scenario.js` | 1,500 | Combined scenario: GPS + WebSocket consumers |

### Running

```bash
# GPS ingestion only
k6 run load-tests/gps-ingestion.js

# WebSocket consumers only
k6 run load-tests/ws-consumers.js

# Full combined scenario
k6 run load-tests/full-scenario.js

# Monitor system during test (separate terminal)
bash load-tests/check-system.sh
```

### Performance Thresholds

| Metric | Threshold |
|---|---|
| GPS API p95 latency | < 200ms |
| GPS API p99 latency | < 500ms |
| GPS API error rate | < 1% |
| WS connection error rate | < 5% |
| WS connection p95 time | < 3s |

### Cleanup

```bash
docker exec -i mysql mysql -u root -prootpassword tracking < scripts/cleanup-load-test-drivers.sql
```

> Complete documentation: [load-tests/README.md](load-tests/README.md)

---

## 📊 Project Status

### ✅ Phase 1 — Foundation (Completed)
- [x] Docker Compose with all infrastructure services
- [x] Traccar configured with PostgreSQL and webhook
- [x] Apache Kafka in KRaft mode (no Zookeeper)
- [x] NestJS project with modular structure
- [x] Traccar webhook controller + Kafka producer

### ✅ Phase 2 — CDC & Data Sync (Completed)
- [x] MySQL configured with binlog (ROW, GTID)
- [x] Kafka Connect with Debezium MySQL connector
- [x] CDC consumer in NestJS (sync accounts, customers, products)
- [x] PostgreSQL local cache schema
- [x] 3-level cache service (Memory → Redis → PG)

### ✅ Phase 3 — Enrichment & Real-Time (Completed)
- [x] Enrichment service (consume positions, join with cached data)
- [x] Driver, route, and visit management (local DB)
- [x] Geofence proximity detection and auto-arrival
- [x] TimescaleDB schema with hypertables, compression, and continuous aggregates
- [x] TimescaleDB writer (store enriched positions)
- [x] Parallel fan-out to Redis, PG, TimescaleDB, and Kafka

### ✅ Phase 4 — WebSocket & Dashboard (Completed)
- [x] Socket.io WebSocket gateway with Redis adapter
- [x] Room-based broadcasting (per tenant, driver, and route)
- [x] React frontend with map (Mapbox/Leaflet)
- [x] Route history playback with time slider and speed controls
- [x] Driver list panel with real-time status
- [x] Map legend and controls overlay (z-index fixed above Leaflet tiles)
- [x] History map layout fix (flex chain for proper Leaflet container height)

### ✅ Phase 5 — Route Builder (Completed)
- [x] OSRM routing engine with La Paz road network
- [x] OR-Tools VRP solver (Python FastAPI sidecar)
- [x] Route optimization endpoint (OSRM matrix → OR-Tools → DB update)
- [x] Manual visit reordering with drag-and-drop (@dnd-kit)
- [x] Route builder UI (sidebar + map with customer markers and route polylines)
- [x] Add/remove stops, create routes from frontend
- [x] La Paz customer seed data (20 customers with real coordinates)

### ✅ Phase 6 — Monitoring & Hardening (Completed)
- [x] JWT authentication with role-based access control
- [x] User management (users owned directly by PostgreSQL `tracking_cache`, written by the auth module — no MySQL/CDC loop)
- [x] WebSocket authentication
- [x] CDC lag monitoring
- [x] Error handling and dead letter queues (retry + DLQ across all consumers)
- [x] Global HTTP exception filter
- [x] DLQ admin REST API (inspect, replay, monitor)
- [x] DLQ metrics integrated into health endpoint
- [x] Load testing with k6 (1,000 GPS drivers + 500 WebSocket clients)

### ✅ Phase 7 — Reports (Completed)
- [x] History module with visit completions and daily stats endpoints
- [x] Date range filtering on routes endpoint (backward-compatible)
- [x] Reports page with 4 tabs: Routes, Visits, Positions, Statistics
- [x] CSV export for all report tabs
- [x] Drivers PostgreSQL-owned (direct writes, update, soft-deactivate, device pairing; cut from MySQL/CDC)

---

## 📝 Test Drivers

The system comes pre-loaded with 3 test drivers:

| Name | Device ID | Tenant | Vehicle | Plate |
|---|---|---|---|---|
| John Smith | DEV001 | tenant-1 | Van | ABC-1234 |
| Jane Doe | DEV002 | tenant-1 | Truck | DEF-5678 |
| Bob Wilson | DEV003 | tenant-2 | Van | GHI-9012 |

## 📝 Test Vehicles

The system comes pre-loaded with 3 test vehicles linked to the demo drivers:

| Plate | Type | Brand | Model | Year | Color | Capacity (kg) | Tenant | Assigned Driver |
|---|---|---|---|---|---|---|---|---|
| ABC-1234 | Van | Mercedes-Benz | Sprinter | 2022 | White | 1,500 | tenant-1 | John Smith |
| DEF-5678 | Truck | Volvo | FH16 | 2021 | Blue | 5,000 | tenant-1 | Jane Doe |
| GHI-9012 | Van | Ford | Transit | 2023 | Silver | 1,200 | tenant-2 | Bob Wilson |

## 📝 Test Customers (La Paz, Bolivia)

| Name | Tenant | Location | Geofence | Type |
|---|---|---|---|---|
| Farmacia Bolivia Centro | tenant-1 | -16.4955, -68.1336 | 100m | retail |
| Tienda El Prado | tenant-1 | -16.5025, -68.1310 | 100m | retail |
| Distribuidora San Francisco | tenant-1 | -16.4980, -68.1380 | 150m | warehouse |
| Mercado Lanza - Puesto 42 | tenant-1 | -16.4970, -68.1450 | 80m | retail |
| Supermercado Hipermaxi Calacoto | tenant-1 | -16.5320, -68.0830 | 200m | retail |
| Restaurante Gustu | tenant-1 | -16.5280, -68.0890 | 100m | restaurant |
| Oficina Sopocachi Plaza | tenant-1 | -16.5120, -68.1220 | 100m | office |
| Librería Sopocachi | tenant-1 | -16.5080, -68.1250 | 80m | retail |
| Clínica Miraflores | tenant-1 | -16.5050, -68.1150 | 120m | clinic |
| Panadería Miraflores | tenant-1 | -16.5100, -68.1180 | 80m | retail |
| Ferretería Obrajes | tenant-1 | -16.5250, -68.1020 | 100m | retail |
| Gimnasio Power Fit | tenant-1 | -16.5200, -68.0950 | 100m | gym |
| Almacén Villa Fátima | tenant-1 | -16.4900, -68.1200 | 120m | warehouse |
| Taller Mecánico Achachicala | tenant-1 | -16.4850, -68.1280 | 150m | workshop |
| Hotel Presidente | tenant-1 | -16.4990, -68.1350 | 100m | hotel |
| Centro Comercial MegaCenter | tenant-1 | -16.5380, -68.0780 | 250m | mall |
| Universidad Mayor de San Andrés | tenant-1 | -16.5040, -68.1270 | 200m | university |
| Mercado Rodríguez | tenant-1 | -16.4960, -68.1410 | 100m | retail |
| Café del Mundo Sopocachi | tenant-1 | -16.5110, -68.1230 | 60m | restaurant |
| Terminal de Buses La Paz | tenant-1 | -16.5150, -68.1500 | 200m | terminal |
| Distribuidora Oruro Central | tenant-2 | -16.5000, -68.1370 | 150m | warehouse |
| Tienda Express Miraflores | tenant-2 | -16.5060, -68.1160 | 100m | retail |
| Almacén Sur Calacoto | tenant-2 | -16.5350, -68.0810 | 120m | warehouse |

---

## 📄 License

MVP DEMO project.
