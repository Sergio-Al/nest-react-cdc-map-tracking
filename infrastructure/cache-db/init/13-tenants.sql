-- ═══════════════════════════════════════════════════════════════
-- Tenants registry — the authoritative workspace anchor
-- ═══════════════════════════════════════════════════════════════
-- Until now "tenant" was just a string column scattered across tables with no
-- registry and no uniqueness guard. Self-serve signup needs an ATOMIC anchor so
-- two concurrent signups can't claim the same workspace id (the PK does that),
-- plus a home for the workspace display name. PG-owned, written directly by
-- tracking-service (no MySQL/CDC).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
    id          VARCHAR(50)  PRIMARY KEY,        -- tenantId / slug (the unique anchor)
    name        VARCHAR(120) NOT NULL,           -- human display name
    owner_email VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Backfill the seeded demo tenants so the registry is complete.
INSERT INTO tenants (id, name, owner_email) VALUES
    ('tenant-1', 'Tenant One', 'admin@tenant1.com'),
    ('tenant-2', 'Tenant Two', 'admin@tenant2.com')
ON CONFLICT (id) DO NOTHING;
