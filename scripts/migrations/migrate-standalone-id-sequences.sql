-- Existing volumes: reserve ids >= 1e9 for standalone customer/order writes.
-- Run with: docker exec -i cache-db psql -U tracking -d tracking_cache < scripts/migrations/migrate-standalone-id-sequences.sql
-- Low standalone order ids may be referenced by visits: report, never renumber.
BEGIN;
LOCK TABLE customers_cache, orders_cache IN ACCESS EXCLUSIVE MODE;
CREATE SEQUENCE IF NOT EXISTS customers_cache_id_seq START WITH 1000000000;
CREATE SEQUENCE IF NOT EXISTS orders_cache_id_seq START WITH 1000000000;
ALTER TABLE customers_cache ALTER COLUMN id SET DEFAULT nextval('customers_cache_id_seq');
ALTER TABLE orders_cache ALTER COLUMN id SET DEFAULT nextval('orders_cache_id_seq');
ALTER SEQUENCE customers_cache_id_seq OWNED BY customers_cache.id;
ALTER SEQUENCE orders_cache_id_seq OWNED BY orders_cache.id;

-- Preserve the sequence high-water mark too: deleted rows/rolled-back inserts
-- must not cause previously issued ids to be reused on a subsequent migration.
SELECT setval('customers_cache_id_seq', GREATEST(
    1000000000,
    COALESCE((SELECT MAX(id) + 1 FROM customers_cache WHERE id >= 1000000000), 1000000000),
    (SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END FROM customers_cache_id_seq)
), false);
SELECT setval('orders_cache_id_seq', GREATEST(
    1000000000,
    COALESCE((SELECT MAX(id) + 1 FROM orders_cache WHERE id >= 1000000000), 1000000000),
    (SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END FROM orders_cache_id_seq)
), false);

DO $$
DECLARE legacy_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO legacy_count
    FROM orders_cache o
    LEFT JOIN tenant_settings t ON t.tenant_id = o.tenant_id
    WHERE o.id < 1000000000 AND COALESCE(t.ingest_mode, 'standalone') = 'standalone';
    IF legacy_count > 0 THEN
        RAISE NOTICE '% standalone orders have ids below 1000000000; left unchanged because planned_visits.order_id may reference them', legacy_count;
    END IF;
END $$;
COMMIT;
