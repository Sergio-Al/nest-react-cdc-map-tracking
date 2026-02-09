# Vehicle Distribution Tracking System - Project Specification

## 1. Project Overview

Real-time vehicle distribution tracking system that monitors **1,000 drivers** making deliveries, with a dashboard serving **500 concurrent users** who can view live positions, planned visits, route history, and playback routes with a time slider.

### Core Requirements
- GPS devices send data to **Traccar** (open-source GPS tracking server)
- Traccar stores positions in its own **PostgreSQL** database
- Positions are captured and forwarded to **Apache Kafka** via Traccar's webhook forwarder
- A **NestJS Tracking Service** consumes positions from Kafka, enriches them with business data from **SQL Server** (source of truth), and broadcasts to dashboard users via **WebSocket (Socket.io)**
- Enriched positions are stored in **TimescaleDB** for historical queries and route playback
- The tracking service maintains a **local PostgreSQL cache** to avoid constantly querying SQL Server
- **Debezium CDC** keeps the local cache in sync with SQL Server in near real-time (~1-5 seconds delay)
- **Redis** is used for caching latest positions, multi-instance WebSocket coordination (Socket.io Redis adapter), and pub/sub

---

## 2. System Architecture

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
┌──────────────┐
│ APACHE KAFKA │◀──── Debezium CDC ◀──── SQL SERVER (Core)
│              │                          (Customers, Accounts,
│ Topics:      │                           Orders, Products)
│ • gps.positions          │
│ • gps.positions.enriched │
│ • gps.events             │
│ • visits.events          │
│ • cdc.Customers          │
│ • cdc.Accounts           │
│ • cdc.Products           │
│ • cdc.Orders             │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│          TRACKING SERVICE (NestJS)               │
│  (3 instances behind load balancer)              │
│                                                  │
│  ┌──��──────────────┐  ┌──────────────────────┐  │
│  │ Traccar Webhook  │  │ Kafka Consumers      │  │
│  │ Controller       │  │ • Position consumer  │  │
│  │ POST /positions  │  │ • CDC sync consumer  │  │
│  │ POST /events     │  │ • Visit events       │  │
│  └────────┬─────────┘  └──────────┬───────────┘  │
│           │                       │               │
│           ▼                       ▼               │
│  ┌──────────────────────────────────────────┐    │
│  │         Enrichment Service                │    │
│  │  • Join GPS position with:                │    │
│  │    - Driver info (local cache)            │    │
│  │    - Customer data (local cache)          │    │
│  │    - Planned visits (local DB)            │    │
│  │  • Calculate proximity & ETA              │    │
│  │  • Detect arrival/departure (geofence)    │    │
│  └──────────────────────────────────────────┘    │
│           │                                      │
│     ┌─────┼──────────────┬───────────────┐       │
│     ▼     ▼              ▼               ▼       │
│  ┌─────┐ ┌────────┐ ┌──────────┐ ┌───────────┐  │
│  │Redis│ │Local PG│ │Timescale │ │ WebSocket │  │
│  │Cache│ │ Cache  │ │   DB     │ │ Gateway   │  │
│  └─────┘ └────────┘ └──────────┘ └─────┬─────┘  │
│                                        │         │
└────────────────────────────────────────┼─────────┘
                                         │ Socket.io
                                         ▼
                              ┌─────────────────────┐
                              │   React Dashboard    │
                              │   (500 users)        │
                              │   • Live map          │
                              │   • Driver list       │
                              │   • Route playback    │
                              │   • Visit tracking    │
                              └─────────────────────┘
```

---

## 3. Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| GPS Server | Traccar | 5.12+ | Protocol decoding, device management |
| Traccar DB | PostgreSQL | 16 | Traccar's internal storage |
| Message Broker | Apache Kafka | 3.6+ (KRaft mode) | Event streaming, decoupling |
| CDC | Debezium | 2.5+ | SQL Server → Kafka change capture |
| Kafka Connect | Debezium Connect | 2.5+ | Runs Debezium connectors |
| Source of Truth DB | SQL Server | 2016+ | Core business data (Customers, Accounts, Orders, Products) |
| Tracking Service | NestJS | 10+ | Main backend service |
| Local Cache DB | PostgreSQL | 16 | Cached SQL Server data, planned visits, routes |
| Historical DB | TimescaleDB | Latest (PG16) | Time-series position history, analytics |
| Cache / Pub-Sub | Redis | 7+ | Latest positions, WebSocket adapter, caching |
| WebSocket | Socket.io | 4+ | Real-time push to dashboard |
| Frontend | React | 18+ | Dashboard with map |
| Map Library | Mapbox GL JS or Leaflet | Latest | Map rendering |
| Language | TypeScript | 5+ | Backend and frontend |
| Containerization | Docker + Docker Compose | Latest | Development and deployment |

---

## 4. Data Flow

### 4.1 GPS Position Flow
1. GPS device sends position to Traccar via TCP/UDP
2. Traccar decodes, validates, filters, stores in its PostgreSQL
3. Traccar forwards position via HTTP webhook to Tracking Service
4. Tracking Service publishes raw position to Kafka topic `gps.positions`
5. Tracking Service consumes from `gps.positions`, enriches with:
   - Driver info (from local PostgreSQL cache)
   - Customer data (from local cache, synced from SQL Server via CDC)
   - Planned visit context (from local DB - which visit is next, distance, ETA)
   - Geofence proximity detection (is driver near customer?)
6. Enriched position is:
   - Stored in Redis (latest position per driver, TTL 5 min)
   - Stored in local PostgreSQL (driver_positions snapshot table)
   - Stored in TimescaleDB (historical time-series)
   - Published to Kafka topic `gps.positions.enriched`
   - Broadcast to WebSocket clients (via Socket.io rooms)

### 4.2 SQL Server Sync Flow (CDC)
1. Application writes to SQL Server tables (Customers, Accounts, etc.)
2. SQL Server CDC captures changes from transaction log
3. Debezium reads CDC capture tables
4. Debezium publishes change events to Kafka topics (`cdc.Customers`, `cdc.Accounts`, etc.)
5. Tracking Service CDC consumer processes events:
   - INSERT/UPDATE → Upsert into local PostgreSQL cache
   - DELETE → Remove from local PostgreSQL cache
   - Invalidate Redis cache for changed records
6. Three-level cache strategy for reads:
   - Level 1: In-memory Map (60s TTL)
   - Level 2: Redis (5 min TTL)
   - Level 3: Local PostgreSQL (always fresh via CDC)
   - Fallback: SQL Server direct query (should rarely happen)

### 4.3 Visit Lifecycle Flow
1. Planned visits are created in the Tracking Service local DB (via API)
2. When driver approaches customer geofence → auto-detect arrival
3. Driver starts visit → status: `in_progress`
4. Driver completes visit (via mobile API) → status: `completed`
5. Visit events published to Kafka `visits.events`
6. Visit history stored in TimescaleDB for analytics
7. Dashboard receives real-time visit status updates via WebSocket

---

## 5. Database Schemas

### 5.1 Local PostgreSQL Cache (Tracking Service DB)

**Synced from SQL Server (read model):**
- `customers_cache` - Customer data (id, tenant_id, name, phone, address, latitude, longitude, geofence_radius_meters, customer_type, etc.)
- `accounts_cache` - Account data (id, tenant_id, name, account_type, settings)
- `products_cache` - Product data (id, tenant_id, name, sku, category, unit_price)

**Owned by Tracking Service:**
- `drivers` - Driver info (id, tenant_id, device_id [Traccar], name, phone, vehicle_plate, vehicle_type, status)
- `routes` - Planned delivery routes (id, tenant_id, driver_id, scheduled_date, status, total_stops, completed_stops)
- `planned_visits` - Stops in a route (id, tenant_id, route_id, driver_id, customer_id, sequence_number, visit_type, scheduled_date, time_window, status, arrived_at, completed_at, completion details)
- `driver_positions` - Latest position snapshot per driver (driver_id PK, latitude, longitude, speed, heading, current_route_id, current_visit_id, next_visit_id, distance_to_next, eta_to_next)
- `sync_state` - CDC/sync tracking (table_name PK, last_version, last_synced_at, status)

### 5.2 TimescaleDB (Historical)

**Hypertables:**
- `enriched_positions` - All enriched positions (time, driver_id, tenant_id, lat, lng, speed, heading, route_id, visit_id, customer_name, distance_to_next, eta) - partitioned by day, compressed after 7 days, retained for 365 days
- `visit_completions` - Completed visit records for analytics

**Continuous Aggregates:**
- `driver_daily_stats` - Daily driver statistics (avg_speed, max_speed, moving_percentage, visits_count)
- `visit_performance_daily` - Daily visit KPIs per tenant (total, completed, failed, on_time, avg_duration)

### 5.3 SQL Server Tables Captured by CDC
- `dbo.Customers` - Source of truth for customer data
- `dbo.Accounts` - Source of truth for account data
- `dbo.Products` - Source of truth for product data
- `dbo.Orders` - Source of truth for orders
- `dbo.debezium_signal` - Signal table for triggering incremental snapshots

---

## 6. Services & Modules

### 6.1 Tracking Service (NestJS) - Modules

```
tracking-service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   ├── configuration.ts
│   │   └── database.config.ts          # 3 DB connections: Local PG, SQL Server (read-only), TimescaleDB
│   ├── modules/
│   │   ├── traccar/
│   │   │   ├── traccar.controller.ts   # POST /api/traccar/positions, POST /api/traccar/events
│   │   │   └── traccar-ingestion.service.ts
│   │   ├── kafka/
│   │   │   ├── kafka-producer.service.ts
│   │   │   └── kafka-consumer.service.ts
│   │   ├── enrichment/
│   │   │   └── enrichment.service.ts   # Consumes gps.positions, joins with cache, produces enriched
│   │   ├── sync/
│   │   │   ├── cdc-consumer.service.ts # Consumes cdc.* topics, updates local cache
│   │   │   ├── cdc-monitor.service.ts  # Monitors CDC lag and health
│   │   │   └── entities/sync-state.entity.ts
│   │   ├── customers/
│   │   │   ├── customer-cache.service.ts  # Three-level cache (memory → Redis → PG → SQL Server)
│   │   │   └── entities/cached-customer.entity.ts
│   │   ├── drivers/
│   │   │   ├── drivers.controller.ts
│   │   │   ├── drivers.service.ts
│   │   │   └── entities/
│   │   ├── routes/
│   │   │   ├── routes.controller.ts
│   │   │   ├── routes.service.ts
│   │   │   └── entities/
│   │   ├── visits/
│   │   │   ├── visits.controller.ts
│   │   │   ├── visits.service.ts       # Visit lifecycle: create, start, complete, skip
│   │   │   └── entities/
│   │   ├── websocket/
│   │   │   └── tracking.gateway.ts     # Socket.io gateway with Redis adapter
│   │   ├── timescale/
│   │   │   └── timescale.service.ts    # Historical queries, route playback
│   │   ├── redis/
│   │   │   └── redis.service.ts        # Cache, pub/sub, Socket.io adapter
│   │   └── sqlserver/
│   │       └── sqlserver-connection.service.ts  # Read-only connection to SQL Server (mssql package)
```

### 6.2 WebSocket Events

**Server → Client:**
- `initial-state` - All active drivers with positions (on connect)
- `driver-position` - Real-time position update for a driver
- `driver-position-detailed` - Full enriched position (when subscribed to specific driver)
- `visit-event` - Visit arrival, departure, completion events
- `driver-event` - Driver online/offline/status changes
- `alert` - Speed, geofence, battery alerts

**Client → Server:**
- `subscribe-driver` - Subscribe to specific driver updates
- `unsubscribe-driver` - Unsubscribe from driver
- `subscribe-delivery` - Subscribe to delivery updates
- `get-route-history` - Request historical route for playback (returns points from TimescaleDB)
- `get-driver-stats` - Request driver statistics

### 6.3 Kafka Topics

| Topic | Producer | Consumer | Purpose |
|-------|----------|----------|---------|
| `gps.positions` | Tracking Service (webhook receiver) | Tracking Service (enrichment) | Raw GPS positions from Traccar |
| `gps.positions.enriched` | Tracking Service (enrichment) | Tracking Service (WebSocket broadcast) | Enriched positions with business context |
| `gps.events` | Tracking Service | Tracking Service | Traccar events (ignition, geofence) |
| `visits.events` | Tracking Service | Tracking Service (WebSocket) | Visit lifecycle events |
| `cdc.Customers` | Debezium | Tracking Service (CDC consumer) | Customer changes from SQL Server |
| `cdc.Accounts` | Debezium | Tracking Service (CDC consumer) | Account changes from SQL Server |
| `cdc.Products` | Debezium | Tracking Service (CDC consumer) | Product changes |
| `cdc.Orders` | Debezium | Tracking Service (CDC consumer) | Order changes |

---

## 7. Infrastructure

### 7.1 Docker Compose Services
- `traccar` - Traccar GPS server (image: traccar/traccar:5.12)
- `traccar-db` - Traccar PostgreSQL (image: postgres:16)
- `kafka` - Apache Kafka in KRaft mode (image: bitnami/kafka:3.6)
- `kafka-connect` - Debezium Connect (image: debezium/connect:2.5)
- `kafka-ui` - Kafka monitoring UI (image: provectuslabs/kafka-ui)
- `cache-db` - Local PostgreSQL cache (image: postgres:16)
- `timescale` - TimescaleDB (image: timescale/timescaledb:latest-pg16)
- `redis` - Redis cache (image: redis:7-alpine)
- `tracking-service` - NestJS backend (3 replicas)
- `frontend` - React dashboard

### 7.2 SQL Server Setup (External - DBA tasks)
- Enable CDC on database
- Enable CDC on tables: Customers, Accounts, Products, Orders
- Create read-only user `debezium_user` with CDC permissions
- Create signal table `dbo.debezium_signal`
- Set CDC retention to 5 days
- Verify SQL Server Agent is running

### 7.3 Debezium Connector Configuration
- Connector class: `io.debezium.connector.sqlserver.SqlServerConnector`
- Snapshot mode: `initial` (full snapshot on first run, then CDC stream)
- Transforms: `ExtractNewRecordState` (flattens payload), `RegexRouter` (renames topics to `cdc.{table}`)
- Error handling: Dead letter queue, log errors, continue processing
- Signal table enabled for incremental snapshots

---

## 8. Key Design Patterns

1. **Webhook Ingestion** - Traccar forwards positions via HTTP to our service
2. **Event-Driven Enrichment** - Consume raw → enrich → produce enriched (via Kafka)
3. **CDC Sync** - Debezium captures SQL Server changes → Kafka → local cache
4. **Three-Level Cache** - Memory (60s) → Redis (5min) → Local PG → SQL Server (fallback)
5. **Room-Based WebSocket** - Socket.io rooms per tenant and per driver for targeted broadcasting
6. **Redis Socket.io Adapter** - Enables multi-instance WebSocket (3 NestJS instances share connections)
7. **Geofence Detection** - Calculate distance to next customer, auto-detect arrival/departure
8. **Continuous Aggregates** - TimescaleDB auto-refreshes materialized views for analytics

---

## 9. Resource Estimation (1000 Drivers / 500 Users)

| Component | Instances | CPU | Memory | Storage | Est. Monthly |
|-----------|-----------|-----|--------|---------|-------------|
| Traccar | 2 | 4 vCPU | 8 GB | 100 GB | $150 |
| Traccar PostgreSQL | 1 | 2 vCPU | 4 GB | 200 GB | $80 |
| Kafka Cluster | 3 | 6 vCPU | 24 GB | 450 GB | $350 |
| Kafka Connect (Debezium) | 1 | 2 vCPU | 4 GB | - | $60 |
| Tracking Service (NestJS) | 3 | 12 vCPU | 24 GB | - | $300 |
| Local PostgreSQL (cache) | 1 | 2 vCPU | 4 GB | 50 GB | $60 |
| TimescaleDB | 2 | 8 vCPU | 32 GB | 1 TB | $450 |
| Redis Cluster | 3 | 6 vCPU | 12 GB | - | $150 |
| Load Balancer | 1 | - | - | - | $50 |
| **TOTAL** | **17** | **~42 vCPU** | **~112 GB** | **~1.8 TB** | **~$1,650/mo** |

---

## 10. Multi-Tenancy

- **Hybrid approach**: Shared Kafka topics with tenant headers for standard data; dedicated topics for high-volume premium tenants
- Tenant ID present in all entities, Kafka message headers, and WebSocket rooms
- Room-based isolation: `tenant:{tenantId}` rooms in Socket.io
- Access control: Verify tenant ownership before subscribing to driver/delivery updates
- Local cache is tenant-aware (all queries filtered by tenant_id)

---

## 11. Scaling Path

| Scale | Drivers | Users | Key Changes |
|-------|---------|-------|------------|
| **Current** | 1,000 | 500 | Architecture as described above |
| **Medium** | 5,000 | 2,000 | Add Kafka partitions, scale NestJS to 5 instances, larger TimescaleDB |
| **Large** | 10,000+ | 5,000+ | Consider Apache Flink for complex CEP (anomaly detection, ML-based ETA), add Kafka Streams for simple processing |
| **Enterprise** | 50,000+ | 10,000+ | Full Flink cluster, dedicated Kafka topics per tenant, TimescaleDB multi-node |

---

## 12. Implementation Order

### Phase 1: Foundation
1. Set up Docker Compose with all infrastructure services
2. Configure Traccar with PostgreSQL and webhook forwarding
3. Set up Kafka (KRaft mode, no Zookeeper)
4. Create NestJS project with module structure
5. Implement Traccar webhook controller and Kafka producer

### Phase 2: CDC & Data Sync
6. Enable CDC on SQL Server (work with DBA)
7. Set up Kafka Connect with Debezium SQL Server connector
8. Implement CDC consumer in NestJS (sync Customers, Accounts, Products)
9. Create local PostgreSQL cache schema
10. Implement three-level cache service (Memory → Redis → PG → SQL Server)

### Phase 3: Enrichment & Real-Time
11. Implement enrichment service (consume raw positions, join with cached data)
12. Implement driver/route/visit management (local DB)
13. Implement geofence proximity detection and visit auto-arrival
14. Set up TimescaleDB schema with hypertables, compression, continuous aggregates
15. Implement TimescaleDB writer (store enriched positions)

### Phase 4: WebSocket & Dashboard
16. Implement Socket.io WebSocket gateway with Redis adapter
17. Implement room-based broadcasting (tenant rooms, driver rooms)
18. Build React frontend with map (Mapbox/Leaflet)
19. Implement route history playback with time slider
20. Build driver list panel with real-time status

### Phase 5: Monitoring & Hardening
21. Add health check endpoints (CDC, Kafka, Sync, WebSocket)
22. Set up Kafka UI for topic monitoring
23. Add CDC lag monitoring
24. Implement error handling and dead letter queues
25. Load testing with 1000 simulated drivers
```
