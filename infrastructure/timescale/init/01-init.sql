-- ═══════════════════════════════════════════════════════════════
-- TimescaleDB – Historical position data & analytics
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ─── Enriched Positions Hypertable ──────────────────────────
CREATE TABLE IF NOT EXISTS enriched_positions (
    time            TIMESTAMPTZ     NOT NULL,
    driver_id       UUID            NOT NULL,
    tenant_id       VARCHAR(50)     NOT NULL,
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    speed           DOUBLE PRECISION DEFAULT 0,
    heading         DOUBLE PRECISION DEFAULT 0,
    altitude        DOUBLE PRECISION DEFAULT 0,
    accuracy        DOUBLE PRECISION,
    route_id        UUID,
    visit_id        UUID,
    customer_name   VARCHAR(200),
    distance_to_next_m  DOUBLE PRECISION,
    eta_to_next_sec     INT
);

SELECT create_hypertable('enriched_positions', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX idx_ep_driver_time  ON enriched_positions (driver_id, time DESC);
CREATE INDEX idx_ep_tenant_time  ON enriched_positions (tenant_id, time DESC);
CREATE INDEX idx_ep_route_time   ON enriched_positions (route_id, time DESC);

-- ─── Visit Completions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS visit_completions (
    time            TIMESTAMPTZ     NOT NULL,
    visit_id        UUID            NOT NULL,
    tenant_id       VARCHAR(50)     NOT NULL,
    driver_id       UUID            NOT NULL,
    customer_id     BIGINT          NOT NULL,
    route_id        UUID,
    visit_type      VARCHAR(30)     NOT NULL,
    status          VARCHAR(20)     NOT NULL,
    arrived_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_sec    INT,
    on_time         BOOLEAN
);

SELECT create_hypertable('visit_completions', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX idx_vc_tenant_time ON visit_completions (tenant_id, time DESC);
CREATE INDEX idx_vc_driver_time ON visit_completions (driver_id, time DESC);

-- ─── Compression Policies ───────────────────────────────────
-- Compress position data older than 7 days
ALTER TABLE enriched_positions SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'driver_id, tenant_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('enriched_positions', INTERVAL '7 days', if_not_exists => TRUE);

-- Compress visit completions older than 30 days
ALTER TABLE visit_completions SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'tenant_id, driver_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('visit_completions', INTERVAL '30 days', if_not_exists => TRUE);

-- ─── Retention Policy (keep 1 year of positions) ───────────
SELECT add_retention_policy('enriched_positions', INTERVAL '365 days', if_not_exists => TRUE);

-- ─── Continuous Aggregates ──────────────────────────────────

-- Daily driver stats
CREATE MATERIALIZED VIEW IF NOT EXISTS driver_daily_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    driver_id,
    tenant_id,
    COUNT(*)                            AS position_count,
    AVG(speed)                          AS avg_speed,
    MAX(speed)                          AS max_speed,
    COUNT(CASE WHEN speed > 1 THEN 1 END)::FLOAT / NULLIF(COUNT(*), 0) AS moving_ratio
FROM enriched_positions
GROUP BY bucket, driver_id, tenant_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('driver_daily_stats',
    start_offset   => INTERVAL '3 days',
    end_offset     => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);
