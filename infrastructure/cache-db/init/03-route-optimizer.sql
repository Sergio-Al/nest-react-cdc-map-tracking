-- ─── Route Optimizer Columns ────────────────────────────────
-- Adds optimization metadata to routes and planned_visits
-- for the OR-Tools VRP solver + OSRM integration.
-- ─────────────────────────────────────────────────────────────

-- ── Routes: optimization metadata ───────────────────────────
ALTER TABLE routes
    ADD COLUMN IF NOT EXISTS total_distance_meters      INT,
    ADD COLUMN IF NOT EXISTS total_estimated_seconds     INT,
    ADD COLUMN IF NOT EXISTS optimized_at                TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS optimization_method         VARCHAR(50);  -- or_tools_vrp | manual

-- ── Planned Visits: per-stop optimization data ──────────────
ALTER TABLE planned_visits
    ADD COLUMN IF NOT EXISTS estimated_arrival_time      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS estimated_travel_seconds    INT,
    ADD COLUMN IF NOT EXISTS estimated_distance_meters   INT;
