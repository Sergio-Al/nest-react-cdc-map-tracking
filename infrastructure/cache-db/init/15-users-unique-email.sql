-- PostgreSQL is the OWNER of users (cut over from the MySQL/CDC loop), so the
-- uniqueness of a login must be guaranteed here — nothing upstream does it.
-- Enforce one account per (tenant, email), case-insensitive, so concurrent
-- registrations can't create duplicate logins (which would make login row
-- selection ambiguous). Replaces the plain idx_cached_users_email_tenant lookup
-- index as the uniqueness guard (that index can stay for read performance).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cached_users_tenant_email
    ON cached_users (tenant_id, lower(email));
