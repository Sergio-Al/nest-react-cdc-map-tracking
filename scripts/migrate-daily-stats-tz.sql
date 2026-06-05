-- ════════════════════════════════════════════════════════════════════════
-- Migrate driver_daily_stats to timezone-aware day buckets.
--
-- The continuous aggregate originally used time_bucket('1 day', time) → UTC
-- days, so the Idle %/Avg speed KPIs were bucketed on UTC boundaries. This
-- rebuilds it with time_bucket('1 day', time, 'America/La_Paz') so "daily"
-- means the local civil day. Continuous aggregates can't be ALTERed for the
-- bucket expression, so we DROP + CREATE + re-add the refresh policy.
--
-- One tz per deployment — change the literal below to match DEFAULT_TZ.
--
-- Run:  docker exec -i timescale psql -U timescale -d tracking_history \
--         < scripts/migrate-daily-stats-tz.sql
-- ════════════════════════════════════════════════════════════════════════

DROP MATERIALIZED VIEW IF EXISTS driver_daily_stats CASCADE;

CREATE MATERIALIZED VIEW IF NOT EXISTS driver_daily_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time, 'America/La_Paz') AS bucket,
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

-- Materialize history immediately so reports have data without waiting for the policy.
CALL refresh_continuous_aggregate('driver_daily_stats', NULL, NULL);
