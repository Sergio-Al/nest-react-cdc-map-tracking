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
│  • commands.customers / commands.drivers  (command topics)    │
│  • cdc.customers / cdc.drivers / cdc.accounts / ...          │
└──────┬──────────────────────────────────────┬────────────────┘
       │                                      │
       │  commands.customers / drivers         │  cdc.* / gps.* / visits.*
       ▼                                      ▼
┌──────────────────────┐    ┌─────────────────────────────────────────────┐
│ INTEGRATION SERVICE  │    │         TRACKING SERVICE (NestJS)            │
│ (Go microservice)    │    │                                             │
│                      │    │  ┌─────────────┐  ┌──────────────────────┐  │
│ • Kafka consumer     │    │  │  Traccar     │  │ Kafka Consumers      │  │
│ • commands.customers │    │  │  Webhook     │  │ • GPS Positions      │  │
│ • commands.drivers   │    │  │  Controller  │  │ • CDC Sync           │  │
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
    cdc.customers /         └─────────────────────────────────────────────┘
    cdc.drivers ──▶ CdcConsumerService ──▶ PostgreSQL cache
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
| Integration Service | Go | 1.23 | Kafka → MySQL command consumer (customers, drivers) |
| Route Optimizer | OR-Tools (Python) | 9.x | VRP solver via FastAPI sidecar |
| WebSocket | Socket.io | 4+ | Real-time push to dashboard |
| Language | TypeScript / Go | 5+ / 1.23 | Backend services |
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
│   │       ├── 02-users.sql          # Users table + admin seed accounts
│   │       └── 03-drivers.sql        # Drivers table (UUID PK, consumed by integration-service)
│   ├── cache-db/
│   │   └── init/
│   │       ├── 01-init.sql           # Cache schema (sync, drivers, routes, visits, positions)
│   │       ├── 02-cached-users.sql   # Cached users table (populated via CDC at runtime)
│   │       ├── 03-route-optimizer.sql # Route optimization columns (routes & planned_visits)
│   │       └── 04-seed-customers-lapaz.sql # La Paz customer seed data (20 tenant-1, 3 tenant-2)
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
├── integration-service/               # Go microservice (Kafka → MySQL)
│   ├── Dockerfile                    # Multi-stage alpine build
│   ├── go.mod
│   ├── cmd/server/main.go            # Entrypoint: config → DB → consumers → health
│   └── internal/
│       ├── config/config.go          # Env-based configuration
│       ├── db/
│       │   ├── mysql.go              # Connection pool setup
│       │   └── queries.go            # Prepared INSERT statements
│       ├── consumer/
│       │   ├── runner.go             # Per-topic goroutine consumer loop
│       │   ├── customers.go          # commands.customers handler
│       │   └── drivers.go            # commands.drivers handler
│       └── health/server.go          # /healthz + /metrics endpoints
│
├── scripts/
│   ├── register-cdc-connector.sh     # Registers the Debezium connector with Kafka Connect
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
        │   ├── dashboard/            # Map, sidebar, driver cards
        │   ├── history/              # Route playback
        │   ├── monitoring/           # CDC lag monitoring (admin)
        │   ├── routes/               # Route builder (sidebar, map, drag-and-drop, dialogs)
        │   ├── layout/               # AppLayout, ProtectedRoute
        │   └── ui/                   # shadcn/ui components
        ├── hooks/                    # React Query hooks, useSocket
        │   └── api/
        │       └── useRouteBuilder.ts # Route builder API hooks (7 hooks)
        ├── pages/                    # Index, Login, History, Monitoring, Routes, NotFound
        ├── stores/                   # Zustand stores (auth, map, playback, routeBuilder)
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
| `integration-service` | 8090 | Go microservice: Kafka commands → MySQL writes |

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
```

### 6. Register the Debezium CDC connector

```bash
# Wait for Kafka Connect to be ready, then register the connector
bash scripts/register-cdc-connector.sh
```

This configures Debezium to capture changes from the `accounts`, `customers`, `products`, and `orders` MySQL tables and publish them to the `cdc.*` Kafka topics.

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

The **integration-service** (Go) runs as a Docker container and starts automatically with `docker compose up -d`. It consumes `commands.customers` and `commands.drivers` from Kafka and writes to MySQL. To verify it is running:

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
| Integration Service | http://localhost:8090/healthz | Go service health check |

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

### Command Write Flow (Customer & Driver creation)

```
POST /api/customers or /api/drivers
    → NestJS produces to Kafka [commands.customers / commands.drivers]
    → HTTP 202 Accepted { correlationId }
    → Integration Service (Go) consumes command
        ├── INSERT into MySQL (with 3× retry + exponential backoff)
        └── On failure → DLQ (commands.customers.dlq / commands.drivers.dlq)
    → Debezium captures MySQL change → cdc.customers / cdc.drivers
    → CdcConsumerService syncs to PostgreSQL cache
```

### CDC Sync Flow (MySQL → Local Cache)

```
MySQL (INSERT/UPDATE/DELETE) → Binlog
    → Debezium captures changes
    → Kafka [cdc.accounts, cdc.customers, cdc.products, cdc.orders, cdc.drivers]
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

### `traccar/` — GPS Data Ingestion
- **TraccarController**: Receives positions and events via HTTP webhook from Traccar.
- **TraccarIngestionService**: Publishes raw positions to `gps.positions` and events to `gps.events`.

### `enrichment/` — Position Enrichment
- **EnrichmentService**: Consumes `gps.positions`, joins with driver/route/visit/customer data, calculates distance and ETA to next destination, detects geofence entry, triggers automatic arrivals.
- **geo-utils.ts**: Utility functions (Haversine distance, ETA estimation, geofence detection).

### `sync/` — CDC Synchronization
- **CdcConsumerService**: Consumes `cdc.*` topics, maps Debezium fields, performs upsert/delete on local cache, updates `sync_state`.
- **SyncController**: Endpoints to query sync status and cached data.

### `customers/` — Customer Cache
- **CustomerCacheService**: Implements 3-level cache (Memory → Redis → PG → MySQL fallback). Supports lookup by ID, by tenant, and geo queries.

### `drivers/` — Driver Management
- **DriversService/Controller**: Driver creation publishes to `commands.drivers` Kafka topic (async, returns HTTP 202). Reads from local PostgreSQL cache.
- **DriverPosition**: Snapshot entity of the latest known position per driver.

### `routes/` — Delivery Routes
- **RoutesService/Controller**: Create, list, update routes. Find active and today's routes by driver. Completed stop counter.
- **RouteOptimizerService**: Orchestrates route optimization — fetches OSRM distance/duration matrix, sends to OR-Tools VRP solver, updates visit sequence, ETAs, and distances.

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
| POST | `/api/drivers` | Create driver |
| PATCH | `/api/drivers/:id` | Update driver |
| GET | `/api/drivers/:id/history?from=&to=` | Driver position history (TimescaleDB) |

### Routes

| Method | Route | Description |
|---|---|---|
| POST | `/api/routes` | Create route |
| GET | `/api/routes` | List routes |
| GET | `/api/routes/:id` | Get route with visits |
| PATCH | `/api/routes/:id` | Update route (e.g. change status) |
| GET | `/api/routes/driver/:driverId/active` | Driver's active route |
| GET | `/api/routes/driver/:driverId/today` | Driver's routes for today |
| GET | `/api/routes/:id/history?from=&to=` | Route position history (TimescaleDB) |
| POST | `/api/routes/:id/optimize` | Optimize visit order using OSRM + OR-Tools |
| PATCH | `/api/routes/:id/reorder` | Manually reorder visits (drag-and-drop) |

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
| `cdc.users` | 3 | Debezium | CdcConsumerService | User changes |
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
- `users` — User accounts with roles (admin, dispatcher, driver)

### PostgreSQL Cache (`tracking_cache`)

**Tables synced via CDC (read-only):**, `cached_users`
- `accounts_cache`, `customers_cache`, `products_cache`

**Tracking service owned tables:**
- `drivers` — Drivers (device_id links to Traccar)
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
- Load test drivers seeded: `docker exec -i mysql mysql -u root -prootpassword tracking < scripts/seed-load-test-drivers.sql`

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
- [x] User management via CDC sync
- [x] WebSocket authentication
- [x] CDC lag monitoring
- [x] Error handling and dead letter queues (retry + DLQ across all consumers)
- [x] Global HTTP exception filter
- [x] DLQ admin REST API (inspect, replay, monitor)
- [x] DLQ metrics integrated into health endpoint
- [x] Load testing with k6 (1,000 GPS drivers + 500 WebSocket clients)

---

## 📝 Test Drivers

The system comes pre-loaded with 3 test drivers:

| Name | Device ID | Tenant | Vehicle | Plate |
|---|---|---|---|---|
| John Smith | DEV001 | tenant-1 | Van | ABC-1234 |
| Jane Doe | DEV002 | tenant-1 | Truck | DEF-5678 |
| Bob Wilson | DEV003 | tenant-2 | Van | GHI-9012 |

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
