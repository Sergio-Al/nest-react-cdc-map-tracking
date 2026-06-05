-- ═══════════════════════════════════════════════════════════════
-- Settings — tenant defaults + per-user overrides
-- ═══════════════════════════════════════════════════════════════
-- Owned and written DIRECTLY by tracking-service (like vehicles/routes/
-- visits) — NOT synced from MySQL/CDC. Effective settings resolve as
-- user value ?? tenant value ?? system default.

-- ─── Tenant defaults (one row per tenant) ───────────────────
CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id              VARCHAR(50)  PRIMARY KEY,
    timezone               VARCHAR(64)  NOT NULL DEFAULT 'America/La_Paz',  -- IANA
    locale                 VARCHAR(10)  NOT NULL DEFAULT 'es',
    date_format            VARCHAR(32)  NOT NULL DEFAULT 'dd/MM/yyyy',
    number_format          VARCHAR(20)  NOT NULL DEFAULT 'es-BO',           -- BCP47 for Intl.NumberFormat
    units                  VARCHAR(10)  NOT NULL DEFAULT 'metric',          -- metric | imperial
    default_report_preset  VARCHAR(10)  NOT NULL DEFAULT '14d',
    -- Per-tenant write mode for business entities (orders today). standalone = PG is
    -- source of truth, direct synchronous writes; integrated = MySQL/CDC backbone.
    ingest_mode            VARCHAR(20)  NOT NULL DEFAULT 'standalone',       -- standalone | integrated
    -- Integrated-mode only: whether the dashboard may create/update orders (round-tripped
    -- via commands.orders → MySQL → CDC) or orders are strictly ERP/CDC-originated.
    allow_app_order_create BOOLEAN      NOT NULL DEFAULT true,
    extra                  JSONB,
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Per-user overrides (NULL column = inherit tenant default) ──
CREATE TABLE IF NOT EXISTS user_settings (
    user_id                VARCHAR(36)  PRIMARY KEY,
    tenant_id              VARCHAR(50)  NOT NULL,
    timezone               VARCHAR(64),
    locale                 VARCHAR(10),
    date_format            VARCHAR(32),
    number_format          VARCHAR(20),
    units                  VARCHAR(10),
    default_report_preset  VARCHAR(10),
    theme                  VARCHAR(10),   -- user-only: light | dark | system
    density                VARCHAR(15),   -- user-only: comfortable | compact
    extra                  JSONB,
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_settings_tenant ON user_settings(tenant_id);

-- ─── Seed tenant defaults for the demo tenants ──────────────
-- The demo tenants run the full MySQL/CDC stack, so they are seeded as 'integrated'
-- (new self-serve tenants default to 'standalone' via the column default above).
INSERT INTO tenant_settings (tenant_id, timezone, locale, units, default_report_preset, ingest_mode) VALUES
    ('tenant-1', 'America/La_Paz', 'es', 'metric', '14d', 'integrated'),
    ('tenant-2', 'America/La_Paz', 'es', 'metric', '14d', 'integrated')
ON CONFLICT (tenant_id) DO NOTHING;
