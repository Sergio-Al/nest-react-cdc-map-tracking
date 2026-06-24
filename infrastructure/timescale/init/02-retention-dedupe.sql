-- ═══════════════════════════════════════════════════════════════
-- Retention for the remaining hypertables/caggs + dedupe keys so the
-- at-least-once gps.positions.enriched / visit consumers can't write
-- duplicate history rows (which skew playback and daily stats).
--
-- Apply to a running DB with:
--   docker exec -i timescale psql -U timescale -d tracking_history < \
--     infrastructure/timescale/init/02-retention-dedupe.sql
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- ─── Retention (01-init only covers enriched_positions) ─────
-- Keep 2 years of completed-visit history and daily stats.
SELECT add_retention_policy('visit_completions', INTERVAL '730 days', if_not_exists => TRUE);
SELECT add_retention_policy('driver_daily_stats', INTERVAL '730 days', if_not_exists => TRUE);

-- ─── Dedupe existing rows before adding the unique indexes ───
-- Duplicates share a (time, key) and land in the same chunk, so ctid ordering
-- within the chunk is sufficient to keep exactly one.
DELETE FROM enriched_positions a USING enriched_positions b
 WHERE a.ctid < b.ctid AND a.time = b.time AND a.driver_id = b.driver_id;

DELETE FROM visit_completions a USING visit_completions b
 WHERE a.ctid < b.ctid AND a.time = b.time AND a.visit_id = b.visit_id;

-- ─── Dedupe keys ────────────────────────────────────────────
-- Must include the hypertable partition column (time). One enriched position
-- per (driver, instant) and one completion per (visit, instant); redelivered
-- duplicates collide and are dropped by ON CONFLICT DO NOTHING in the writer.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ep_time_driver
    ON enriched_positions (time, driver_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vc_time_visit
    ON visit_completions (time, visit_id);
