-- ─── Routes: one active route per driver per day ────────────
-- Enforces at the DB level that a driver can hold only ONE
-- non-cancelled route on a given (tenant, scheduled_date). This
-- backs the application-level check in RoutesService.assertDriverAvailable
-- and closes the check-then-insert race between concurrent dispatchers.
--
-- Cancelled routes are excluded from the constraint, so a driver
-- may have any number of cancelled routes on the same date.
-- The predicate intentionally matches the service rule (status <> 'cancelled').
--
-- NOTE: creation FAILS if existing data already double-books a driver
-- on a date. Resolve duplicates (cancel/reassign the extras) before applying.
-- ─────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_routes_active_driver_date
    ON routes (tenant_id, driver_id, scheduled_date)
    WHERE status <> 'cancelled';
