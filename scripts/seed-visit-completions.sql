-- ════════════════════════════════════════════════════════════════════════
-- Demo history for the Reports panels — TimescaleDB `visit_completions`.
--
-- The Overview panels (By-zone, Service level, Stop duration, Trend, Heatmap,
-- and the KPI strip) are REAL aggregations over visit_completions; with the
-- table empty they fall back to labeled mock ("demo data" badge). This script
-- fills it so those panels show real numbers.
--
-- Re-runnable: clears the table first. Anchored to now() so rows always land
-- inside the report range regardless of the wall clock — it covers the last 30
-- days through *today* (today's visit times are clamped to now(), so there are
-- no future-dated "completed" visits). Re-run any time to refresh coverage.
--
-- IDs match the seeds: customers 1..20 (tenant-1) / 21..23 (tenant-2) from
-- cache-db 04-seed-customers-lapaz.sql; driver UUIDs from the drivers cache.
-- Zone distribution is driven naturally by how many customers each zone has
-- (Centro has the most → busiest), so By-zone reflects the real customer map.
--
-- Note: the per-row random bucket lives in the generator subquery's SELECT list
-- (a plain volatile random() there fires per row). A `(SELECT random())` sublink
-- would be evaluated ONCE for the whole statement — do not use that here.
--
-- Run:  docker exec -i timescale psql -U timescale -d tracking_history \
--         < scripts/seed-visit-completions.sql
-- ════════════════════════════════════════════════════════════════════════

DELETE FROM visit_completions;

-- ── tenant-1: 2 drivers, customers 1..20, ~18 visits/day for 30 days ──────
INSERT INTO visit_completions
  (time, visit_id, tenant_id, driver_id, customer_id, route_id,
   visit_type, status, arrived_at, completed_at, duration_sec, on_time)
SELECT
  g.ts,
  gen_random_uuid(),
  'tenant-1',
  (CASE WHEN g.rdrv < 0.5
        THEN 'a1b2c3d4-0001-4000-8000-000000000001'
        ELSE 'a1b2c3d4-0001-4000-8000-000000000002' END)::uuid,
  g.cid,
  NULL,
  'delivery',
  st.status,
  g.ts,
  CASE WHEN st.status = 'completed' THEN g.ts + (g.dur || ' seconds')::interval END,
  CASE WHEN st.status = 'completed' THEN g.dur END,
  CASE WHEN st.status = 'completed' THEN g.rontime < 0.88 ELSE false END
FROM (
  SELECT
    LEAST(
      (d + interval '7 hours' + (random() * interval '12 hours'))::timestamptz,
      now() - interval '1 minute')                            AS ts,
    1 + floor(random() * 20)::int                             AS cid,
    180 + floor(random() * 2400)::int                         AS dur,
    random()                                                  AS rstatus,
    random()                                                  AS rdrv,
    random()                                                  AS rontime
  FROM generate_series(
         (now() - interval '30 days')::date,
         now()::date,
         interval '1 day') AS d
  CROSS JOIN generate_series(1, 18) AS n
) AS g
CROSS JOIN LATERAL (
  SELECT CASE
           WHEN g.rstatus < 0.86 THEN 'completed'
           WHEN g.rstatus < 0.93 THEN 'skipped'
           WHEN g.rstatus < 0.98 THEN 'failed'
           ELSE 'cancelled'
         END AS status
) AS st;

-- ── tenant-2: 1 driver, customers 21..23, ~5 visits/day ───────────────────
INSERT INTO visit_completions
  (time, visit_id, tenant_id, driver_id, customer_id, route_id,
   visit_type, status, arrived_at, completed_at, duration_sec, on_time)
SELECT
  g.ts,
  gen_random_uuid(),
  'tenant-2',
  'a1b2c3d4-0002-4000-8000-000000000003'::uuid,
  g.cid,
  NULL,
  'delivery',
  st.status,
  g.ts,
  CASE WHEN st.status = 'completed' THEN g.ts + (g.dur || ' seconds')::interval END,
  CASE WHEN st.status = 'completed' THEN g.dur END,
  CASE WHEN st.status = 'completed' THEN g.rontime < 0.88 ELSE false END
FROM (
  SELECT
    LEAST(
      (d + interval '8 hours' + (random() * interval '10 hours'))::timestamptz,
      now() - interval '1 minute')                            AS ts,
    21 + floor(random() * 3)::int                             AS cid,
    180 + floor(random() * 2400)::int                         AS dur,
    random()                                                  AS rstatus,
    random()                                                  AS rontime
  FROM generate_series(
         (now() - interval '30 days')::date,
         now()::date,
         interval '1 day') AS d
  CROSS JOIN generate_series(1, 5) AS n
) AS g
CROSS JOIN LATERAL (
  SELECT CASE
           WHEN g.rstatus < 0.86 THEN 'completed'
           WHEN g.rstatus < 0.94 THEN 'skipped'
           ELSE 'cancelled'
         END AS status
) AS st;
