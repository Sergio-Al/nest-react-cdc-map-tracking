-- ============================================================
-- Load Test: Seed 1,000 drivers for GPS ingestion benchmarking
-- Run: docker exec -i cache-db psql -U tracking -d tracking_cache < scripts/seed-load-test-drivers.sql
-- ============================================================

-- Generate 1,000 drivers: 700 for tenant-1, 300 for tenant-2
-- Device IDs: LOAD0001 through LOAD1000
-- Vehicle types: random mix of van, truck, motorcycle

DO $$
DECLARE
  i INT;
  tenant TEXT;
  vtype TEXT;
  vtypes TEXT[] := ARRAY['van', 'truck', 'motorcycle'];
  plate_prefix TEXT;
BEGIN
  FOR i IN 1..1000 LOOP
    -- Assign tenant: first 700 → tenant-1, rest → tenant-2
    IF i <= 700 THEN
      tenant := 'tenant-1';
    ELSE
      tenant := 'tenant-2';
    END IF;

    -- Rotate vehicle types
    vtype := vtypes[1 + (i % 3)];

    -- Generate plate
    plate_prefix := CASE WHEN i % 3 = 0 THEN 'LT-VAN' WHEN i % 3 = 1 THEN 'LT-TRK' ELSE 'LT-MOT' END;

    INSERT INTO drivers (id, tenant_id, device_id, name, phone, vehicle_plate, vehicle_type, status, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      tenant,
      'LOAD' || LPAD(i::TEXT, 4, '0'),
      'Load Driver ' || i,
      '+591' || (70000000 + i)::TEXT,
      plate_prefix || '-' || LPAD(i::TEXT, 4, '0'),
      vtype,
      'active',
      NOW(),
      NOW()
    )
    ON CONFLICT (device_id) DO UPDATE SET
      name = EXCLUDED.name,
      tenant_id = EXCLUDED.tenant_id,
      vehicle_type = EXCLUDED.vehicle_type,
      status = 'active',
      updated_at = NOW();
  END LOOP;

  RAISE NOTICE 'Seeded 1,000 load test drivers (LOAD0001–LOAD1000)';
END $$;
