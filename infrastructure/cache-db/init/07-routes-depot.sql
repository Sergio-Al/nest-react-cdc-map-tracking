-- ─── Routes: per-route starting point (depot) ──────────────────
-- Adds an optional, editable starting point to each route, plus a
-- flag for whether the route returns to that point.
--
--   depot_lat / depot_lon  NULL  → "dynamic": the optimizer resolves
--                                  the origin from the driver's live
--                                  GPS at run time (RouteOptimizerService
--                                  .getDriverPosition → La Paz fallback).
--   depot_lat / depot_lon  set   → "pinned": a fixed point chosen on
--                                  the map in the route builder.
--   depot_label                  → human label for the pinned point
--                                  (e.g. an address or "Warehouse").
--   return_to_depot              → true: vehicle returns to the depot
--                                  (round trip). false: route ends at
--                                  the last stop (open route).
--
-- NOTE: init scripts only run on a FRESH cache-db volume. To apply on an
-- existing dev database, run these same statements via:
--   docker exec -i cache-db psql -U tracking -d tracking_cache < 07-routes-depot.sql
-- ───────────────────────────────────────────────────────────────

ALTER TABLE routes ADD COLUMN IF NOT EXISTS depot_lat       DOUBLE PRECISION;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS depot_lon       DOUBLE PRECISION;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS depot_label     VARCHAR(120);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS return_to_depot BOOLEAN NOT NULL DEFAULT true;
