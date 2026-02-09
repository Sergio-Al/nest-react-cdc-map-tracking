-- ═══════════════════════════════════════════════════════════════
-- Cache PostgreSQL – Tracking Service local database
-- ═══════════════════════════════════════════════════════════════

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── CDC Sync State ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_state (
    table_name    VARCHAR(100)    PRIMARY KEY,
    last_offset   VARCHAR(200),
    last_synced_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    status        VARCHAR(20)     NOT NULL DEFAULT 'idle'
);

-- ─── Cached Tables (synced from MySQL / SQL Server via CDC) ─
CREATE TABLE IF NOT EXISTS customers_cache (
    id                      BIGINT          PRIMARY KEY,
    tenant_id               VARCHAR(50)     NOT NULL,
    name                    VARCHAR(200)    NOT NULL,
    phone                   VARCHAR(50),
    email                   VARCHAR(200),
    address                 VARCHAR(500),
    latitude                DOUBLE PRECISION,
    longitude               DOUBLE PRECISION,
    geofence_radius_meters  INT             NOT NULL DEFAULT 100,
    customer_type           VARCHAR(50)     NOT NULL DEFAULT 'regular',
    active                  BOOLEAN         NOT NULL DEFAULT TRUE,
    synced_at               TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_customers_cache_tenant ON customers_cache(tenant_id);

CREATE TABLE IF NOT EXISTS accounts_cache (
    id              BIGINT          PRIMARY KEY,
    tenant_id       VARCHAR(50)     NOT NULL,
    name            VARCHAR(200)    NOT NULL,
    account_type    VARCHAR(50)     NOT NULL DEFAULT 'standard',
    settings        JSONB,
    synced_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_accounts_cache_tenant ON accounts_cache(tenant_id);

CREATE TABLE IF NOT EXISTS products_cache (
    id          BIGINT          PRIMARY KEY,
    tenant_id   VARCHAR(50)     NOT NULL,
    name        VARCHAR(200)    NOT NULL,
    sku         VARCHAR(100)    NOT NULL,
    category    VARCHAR(100),
    unit_price  NUMERIC(12,2)   NOT NULL DEFAULT 0,
    active      BOOLEAN         NOT NULL DEFAULT TRUE,
    synced_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_products_cache_tenant ON products_cache(tenant_id);

-- ─── Tracking-owned Tables ──────────────────────────────────

CREATE TABLE IF NOT EXISTS drivers (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       VARCHAR(50)     NOT NULL,
    device_id       VARCHAR(100),          -- Traccar device identifier
    name            VARCHAR(200)    NOT NULL,
    phone           VARCHAR(50),
    vehicle_plate   VARCHAR(30),
    vehicle_type    VARCHAR(50)     NOT NULL DEFAULT 'van',
    status          VARCHAR(20)     NOT NULL DEFAULT 'offline',  -- online | offline | break
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_drivers_tenant ON drivers(tenant_id);
CREATE INDEX idx_drivers_device ON drivers(device_id);

CREATE TABLE IF NOT EXISTS routes (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       VARCHAR(50)     NOT NULL,
    driver_id       UUID            NOT NULL REFERENCES drivers(id),
    scheduled_date  DATE            NOT NULL,
    status          VARCHAR(20)     NOT NULL DEFAULT 'planned',  -- planned | active | completed | cancelled
    total_stops     INT             NOT NULL DEFAULT 0,
    completed_stops INT             NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_routes_tenant ON routes(tenant_id);
CREATE INDEX idx_routes_driver ON routes(driver_id);
CREATE INDEX idx_routes_date   ON routes(scheduled_date);

CREATE TABLE IF NOT EXISTS planned_visits (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           VARCHAR(50)     NOT NULL,
    route_id            UUID            NOT NULL REFERENCES routes(id),
    driver_id           UUID            NOT NULL REFERENCES drivers(id),
    customer_id         BIGINT          NOT NULL,
    sequence_number     INT             NOT NULL,
    visit_type          VARCHAR(30)     NOT NULL DEFAULT 'delivery', -- delivery | pickup | service
    scheduled_date      DATE            NOT NULL,
    time_window_start   TIME,
    time_window_end     TIME,
    status              VARCHAR(20)     NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed | skipped | failed
    arrived_at          TIMESTAMPTZ,
    departed_at         TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_visits_tenant   ON planned_visits(tenant_id);
CREATE INDEX idx_visits_route    ON planned_visits(route_id);
CREATE INDEX idx_visits_driver   ON planned_visits(driver_id);
CREATE INDEX idx_visits_customer ON planned_visits(customer_id);
CREATE INDEX idx_visits_date     ON planned_visits(scheduled_date);

CREATE TABLE IF NOT EXISTS driver_positions (
    driver_id           UUID            PRIMARY KEY REFERENCES drivers(id),
    tenant_id           VARCHAR(50)     NOT NULL,
    latitude            DOUBLE PRECISION NOT NULL,
    longitude           DOUBLE PRECISION NOT NULL,
    speed               DOUBLE PRECISION DEFAULT 0,
    heading             DOUBLE PRECISION DEFAULT 0,
    altitude            DOUBLE PRECISION DEFAULT 0,
    accuracy            DOUBLE PRECISION,
    current_route_id    UUID,
    current_visit_id    UUID,
    next_visit_id       UUID,
    distance_to_next_m  DOUBLE PRECISION,
    eta_to_next_sec     INT,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dpos_tenant ON driver_positions(tenant_id);

-- ─── Seed: demo drivers ─────────────────────────────────────
INSERT INTO drivers (id, tenant_id, device_id, name, phone, vehicle_plate, vehicle_type, status) VALUES
('a1b2c3d4-0001-4000-8000-000000000001', 'tenant-1', 'DEV001', 'John Smith',    '+1-555-1001', 'ABC-1234', 'van',   'offline'),
('a1b2c3d4-0001-4000-8000-000000000002', 'tenant-1', 'DEV002', 'Jane Doe',      '+1-555-1002', 'DEF-5678', 'truck', 'offline'),
('a1b2c3d4-0002-4000-8000-000000000003', 'tenant-2', 'DEV003', 'Bob Wilson',    '+1-555-2001', 'GHI-9012', 'van',   'offline');
