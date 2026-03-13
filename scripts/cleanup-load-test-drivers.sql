-- ============================================================
-- Cleanup: Remove load test drivers
-- Run: docker exec -i cache-db psql -U tracking -d tracking_cache < scripts/cleanup-load-test-drivers.sql
-- ============================================================

DELETE FROM driver_positions WHERE driver_id IN (
  SELECT id FROM drivers WHERE device_id LIKE 'LOAD%'
);

DELETE FROM drivers WHERE device_id LIKE 'LOAD%';

DO $$
BEGIN
  RAISE NOTICE 'Cleaned up all LOAD* test drivers and their positions';
END $$;
