-- ─────────────────────────────────────────────────────────────
-- Orders (dual-purpose) + visit→order link
--
-- `orders_cache` plays two roles depending on the tenant's ingest_mode:
--   • integrated → it is the PostgreSQL READ MODEL for MySQL `core_business.orders`,
--     populated by the CDC consumer (cdc.orders → CdcConsumerService). `id` mirrors
--     the MySQL bigint primary key (CDC upserts always pass an explicit id).
--   • standalone → it is the OWNER (source of truth), written directly by the
--     tracking-service OrdersService (no MySQL/Kafka/CDC). Direct inserts self-assign
--     an id from `orders_cache_id_seq` (the default below); because CDC always passes
--     an explicit id, the sequence default never fires in integrated mode.
-- The driver-facing "delivery done" lives on planned_visits; a completed visit that
-- carries an order_id flips the order status (standalone: direct PG; integrated:
-- commands.orders → MySQL → CDC → here).
-- ─────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS orders_cache_id_seq;
CREATE SEQUENCE IF NOT EXISTS orders_number_seq;

CREATE TABLE IF NOT EXISTS orders_cache (
    id              BIGINT          PRIMARY KEY DEFAULT nextval('orders_cache_id_seq'),
    tenant_id       VARCHAR(50)     NOT NULL,
    customer_id     BIGINT          NOT NULL,
    order_number    VARCHAR(50)     NOT NULL,
    status          VARCHAR(30)     NOT NULL DEFAULT 'pending',
    total_amount    DOUBLE PRECISION NOT NULL DEFAULT 0,
    delivery_date   DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    synced_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_orders_cache_number UNIQUE (tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_orders_cache_tenant   ON orders_cache(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_cache_customer ON orders_cache(customer_id);

-- Visit→order link. Nullable: a visit may have no order (a pure stop). Its presence
-- gates the order-status echo on completion; the echo path follows the tenant's mode.
ALTER TABLE planned_visits ADD COLUMN IF NOT EXISTS order_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_visits_order ON planned_visits(order_id);
