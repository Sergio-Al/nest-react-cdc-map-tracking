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

# — OR — run the ENTIRE platform in Docker (backend + frontend included):
docker compose --profile full up -d

# Verify all containers are healthy
docker ps --format "table {{.Names}}\t{{.Status}}"
```

The `full` profile additionally builds and starts `tracking-service` (port 3000) and the `frontend` dashboard (port 5173) as containers — with it, steps 7–8 below and the "Local development" run mode are unnecessary. Use plain `docker compose up -d` when you want to run the backend locally with hot reload instead (both modes bind port 3000, so pick one).

The following services will start:

| Container | Port(s) | Description |
|---|---|---|
| `traccar` | 8082, 5001 | Traccar GPS server |
| `traccar-db` | (internal) | Traccar PostgreSQL |
| `kafka` | 9094 (host) | Apache Kafka broker (KRaft) |
| `kafka-init` | — | Creates all 8 Kafka topics (runs once and exits) |
| `kafka-connect` | 8083 | Debezium Connect for CDC |
| `cdc-connector-init` | — | Auto-registers the Debezium CDC connector (runs once and exits) |
| `kafka-ui` | 8080 | Kafka monitoring UI |
| `mysql` | 3306 | Source of truth database |
| `cache-db` | 5432 | Local PostgreSQL cache |
| `timescale` | 5433 | TimescaleDB for historical data |
| `redis` | 6379 | Cache and pub/sub |
| `osrm` | 5003 | OSRM routing engine (La Paz road network) |
| `or-tools-solver` | 5002 | OR-Tools VRP solver (Python FastAPI) |
| `integration-service` | 8090 | NestJS microservice: Kafka commands → MySQL writes |
| `tracking-service` | 3000 | **`--profile full` only** — main NestJS backend in Docker |
| `frontend` | 5173 | **`--profile full` only** — React dashboard served by nginx |

### 4. Set up OSRM (Route Optimization)

```bash
# Download Bolivia OSM data, clip La Paz region, and build OSRM graph
chmod +x infrastructure/osrm/setup.sh
./infrastructure/osrm/setup.sh
```

This downloads the Bolivia OSM extract from Geofabrik, clips it to the La Paz bounding box (`-69.65,-17.05,-67.0,-13.5`), and runs OSRM extract/partition/customize. The resulting graph files are stored in `infrastructure/osrm/data/` (gitignored — every fresh clone must run this once). Until you do, the `osrm` container idles with a reminder message instead of crash-looping — the rest of the stack starts fine without it (only road-network routing/optimization is unavailable). After running the setup: `docker compose restart osrm`.

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

**This now happens automatically**: the `cdc-connector-init` container waits for Kafka Connect and upserts the connector on every `docker compose up`. The manual script remains for re-runs or after editing the connector config (the config itself lives in `scripts/cdc-connector-config.json`, shared by both paths):

```bash
# Manual (re-)registration — idempotent
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

The frontend will be available at `http://localhost:3001`.

---

## ▶️ Running the Application

### Everything in Docker (quickest — no Node/Bun needed on the host)

```bash
docker compose --profile full up -d
```

**First time on a machine only:** download the Bolivia OSM data, build the OSRM routing graph, and restart the router (needs only Docker + `curl`; ~200 MB download, a few minutes):

```bash
chmod +x infrastructure/osrm/setup.sh
./infrastructure/osrm/setup.sh
docker compose restart osrm
```

No seed or migration step is needed on a fresh install — every SQL script in `infrastructure/*/init/` (including the La Paz customer seed) runs automatically the first time the database containers create their volumes. Step 5 above is only for databases that already existed before those scripts were added.

This builds and runs the backend (`tracking-service`, production build) and the dashboard (`frontend`, static build served by nginx) alongside all the infrastructure. Open http://localhost:5173 and log in with `admin@tenant1.com` / `admin123`. After changing backend or frontend code, rebuild with:

```bash
docker compose --profile full build tracking-service frontend
docker compose --profile full up -d
```

> The frontend bakes the backend URL into the bundle at **build** time. The default (`http://localhost:3000`) is correct when you browse from the same machine. To open the dashboard from another device on your network, rebuild with your host's IP: `VITE_API_URL=http://<host-ip>:3000 VITE_WS_URL=http://<host-ip>:3000 docker compose --profile full build frontend`.

### Local development (recommended for backend work — hot reload)

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

### Track a real phone (official Traccar Client app)

Until the native FleetTrack driver app ships, any phone can feed live GPS into the dashboard using the free **Traccar Client** app (App Store / Play Store). Setup has two sides: an admin pairs the device in the dashboard, then the driver configures the app.

**Admin — pair the device (once per phone):**

1. Open the dashboard (http://localhost:5173) and log in (`admin@tenant1.com` / `admin123`).
2. Go to **Drivers**, create the driver (or open an existing one).
3. In the driver's detail panel, **pair a device ID** — e.g. `DEV010`. Pairing auto-registers the device in Traccar. This step is **mandatory**: Traccar rejects positions from unknown identifiers (HTTP 400, no auto-registration), so an unpaired phone sends into the void.

**Driver's phone — configure Traccar Client:**

1. Install **Traccar Client** and open it.
2. **Device identifier**: exactly the paired ID (`DEV010`).
3. **Server URL**: `http://<host-ip>:5055`, where `<host-ip>` is the LAN IP of the machine running Docker (macOS: `ipconfig getifaddr en0` · Linux: `hostname -I` · Windows: `ipconfig`). The phone must be on the same network.
4. Set frequency to 5–10 s, grant location permission (**Always**), and start the service.

**Verify:** within seconds the driver shows a fresh signal in the fleet list and a live marker on the map. If nothing arrives: confirm phone and host share the network, re-check the identifier matches the paired ID character-for-character, and look at `docker logs traccar` — a 400/"unknown device" line means the identifier isn't paired. Note that re-pairing a driver to a new ID disables their old device IDs in Traccar.

> Traccar Client reports **GPS only**. Visit lists, completion with proof, and offline sync are features of the native FleetTrack driver app. Server-side geofence auto-arrival still works, since it's computed in the enrichment pipeline.

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

> **Automated unit tests** (154 tests covering enrichment, visits, auth, drivers, orders and the integration-service command handlers) are documented in [TESTING.md](TESTING.md) ([Spanish version](TESTING.es.md)). Run them with `npm test` inside `tracking-service/` or `integration-service-nest/` — no Docker needed.

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

### Simulate a full planned route

`scripts/simulate-route.mts` drives a real planned route as if a driver's phone were running Traccar Client: road-following positions from OSRM are sent to Traccar's OsmAnd port (5055), so the whole pipeline runs (live map, ETA, geofence auto-arrival/departure, history). At each stop it dwells inside the geofence and completes the visit through the API. Driving is real time with wall-clock timestamps; only the dwell is shortened.

Create the route for today in the Route Builder (`/routes`) first; the driver needs a paired device. Requires Node ≥ 22.18, no dependencies.

```bash
node scripts/simulate-route.mts --list                     # today's routes (UTC date)
node scripts/simulate-route.mts --route <uuid> --dry-run   # preview legs, distance, duration
node scripts/simulate-route.mts --route <uuid>             # drive it (Ctrl-C stops cleanly)
node scripts/simulate-route.mts --route <a> --route <b>    # several drivers at once
node scripts/simulate-route.mts --backfill 30               # seed 30 past workdays for History/Reports
node scripts/simulate-route.mts --clear-backfill           # remove exactly what --backfill wrote
```

`--backfill` generates completed past workdays (Mon–Sat) for every driver with a paired device, using the same streets and driving model, and writes them directly to PostgreSQL and TimescaleDB (via `docker exec … psql`) — the live pipeline only auto-arrives today's visits. It skips days where a driver already has a route and refreshes `driver_daily_stats`. Live runs also refresh it at the end, so Reports include them immediately.

Useful flags: `--dwell 90` (seconds per stop), `--cruise 32` (km/h), `--interval 5` (seconds between fixes), `--no-complete` (leave visits for you to complete in the UI), `--force` (skip pre-flight conflicts), `--allow-manual-arrival` (keep going if auto-arrival doesn't fire). The header of the script documents every option.

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

| Id | Name | Tenant | Zone | Location | Geofence | Type |
|---|---|---|---|---|---|---|
| 1001 | Farmacia Bolivia | tenant-1 | Centro | -16.4955, -68.1336 | 80m | regular |
| 1002 | Supermercado Ketal Sur | tenant-1 | Calacoto | -16.5340, -68.0780 | 100m | premium |
| 1003 | Restaurante Gustu | tenant-1 | Calacoto | -16.5365, -68.0810 | 60m | premium |
| 1004 | Hospital de Clinicas | tenant-1 | Miraflores | -16.5050, -68.1210 | 150m | regular |
| 1005 | Universidad Mayor San Andres | tenant-1 | Centro | -16.5025, -68.1310 | 120m | regular |
| 1006 | Mercado Rodriguez | tenant-1 | Max Paredes | -16.4960, -68.1425 | 80m | regular |
| 1007 | Tienda YPFB San Miguel | tenant-1 | San Miguel | -16.5280, -68.0860 | 100m | regular |
| 1008 | Oficinas BCP Prado | tenant-1 | Centro | -16.5000, -68.1320 | 80m | premium |
| 1009 | Colegio Franco Boliviano | tenant-1 | Obrajes | -16.5250, -68.1040 | 100m | regular |
| 1010 | Megacenter Mall | tenant-1 | Irpavi | -16.5180, -68.0720 | 150m | premium |
| 1011 | Clinica del Sur | tenant-1 | Obrajes | -16.5220, -68.0950 | 120m | premium |
| 1012 | Ferreteria El Constructor | tenant-1 | Cementerio | -16.4980, -68.1510 | 80m | regular |
| 1013 | Panaderia Francesca | tenant-1 | Sopocachi | -16.5080, -68.1250 | 50m | regular |
| 1014 | Distribuidora de Gas LP | tenant-1 | Villa Fatima | -16.4870, -68.1170 | 100m | regular |
| 1015 | Libreria Gisbert | tenant-1 | Centro | -16.4975, -68.1365 | 60m | regular |
| 1016 | Multicine Megacenter | tenant-1 | Irpavi | -16.5189, -68.0730 | 100m | regular |
| 1017 | Taller Automotriz Velasco | tenant-1 | Villa Victoria | -16.4920, -68.1480 | 80m | regular |
| 1018 | Consultorio Dental Sonrisa | tenant-1 | Achumani | -16.5350, -68.0690 | 60m | regular |
| 1019 | Deposito Industrial Achachicala | tenant-1 | Achachicala | -16.4780, -68.1320 | 200m | regular |
| 1020 | Hotel Radisson Plaza | tenant-1 | Sopocachi | -16.5060, -68.1280 | 100m | premium |
| 1021 | Tienda San Pedro | tenant-2 | San Pedro | -16.4990, -68.1400 | 80m | regular |
| 1022 | Mercado Lanza | tenant-2 | Centro | -16.4945, -68.1370 | 100m | regular |
| 1023 | Banco Mercantil Miraflores | tenant-2 | Miraflores | -16.5070, -68.1150 | 80m | premium |

---

## 📄 License

MVP DEMO project.
