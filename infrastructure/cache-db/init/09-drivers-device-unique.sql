-- ─── Drivers: one device_id maps to at most one driver ──────
-- The enrichment device→driver map (EnrichmentService.deviceDriverMap)
-- is keyed by device_id. Two drivers sharing one device_id would
-- silently collide (last-writer-wins) and misroute live GPS.
--
-- Now that drivers are PostgreSQL-owned (written directly by
-- tracking-service, not via MySQL/CDC), this index backs the
-- application-level uniqueness check in DriversService.pairDevice
-- and closes the check-then-write race.
--
-- Partial (WHERE device_id IS NOT NULL) so the many unpaired
-- drivers (NULL device_id) don't collide. Global, not per-tenant,
-- to mirror how the in-memory map is keyed (Traccar device ids are
-- globally unique in practice).
--
-- NOTE: creation FAILS if existing rows already share a device_id.
-- De-dupe before applying.
-- ─────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_drivers_device_id
    ON drivers (device_id)
    WHERE device_id IS NOT NULL;
