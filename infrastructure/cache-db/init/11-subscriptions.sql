-- ═══════════════════════════════════════════════════════════════
-- Subscriptions — the SaaS control plane (plans catalog + per-tenant sub)
-- ═══════════════════════════════════════════════════════════════
-- Owned and written DIRECTLY by tracking-service (like tenant_settings) —
-- NOT in MySQL and NOT CDC'd. This is load-bearing: the plan record GATES
-- whether integration mode is even allowed, so it cannot live behind the
-- integration (Kafka/MySQL/CDC) pipeline — that would be circular, and a pure
-- standalone tenant must work with zero Kafka/CDC alive.
--
-- capability vs intent:
--   • subscription_plans.integration_allowed = is the tier PERMITTED to integrate
--   • tenant_subscriptions.integration_mode   = has the tenant TURNED IT ON (intent)
-- The operational write switch the order path branches on stays
-- tenant_settings.ingest_mode (see 08-settings.sql); EntitlementsService gates
-- flipping it to 'integrated' on integration_allowed. integration_mode here is
-- the billing/intent mirror of that decision.
--
-- Seats: a seat = one active (status <> 'inactive') driver. The effective cap is
-- COALESCE(tenant_subscriptions.seats_purchased, subscription_plans.max_drivers);
-- NULL on both = unlimited.
-- ─────────────────────────────────────────────────────────────

-- ─── Plan catalog (a handful of rows) ───────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
    code                 VARCHAR(20)  PRIMARY KEY,                 -- starter | growth | business
    name                 VARCHAR(60)  NOT NULL,
    price_per_seat_cents  INT          NOT NULL DEFAULT 0,         -- USD cents / active driver / month
    max_drivers          INT,                                      -- NULL = unlimited (per-seat billed)
    integration_allowed  BOOLEAN      NOT NULL DEFAULT false,      -- the upsell gate (capability)
    features             JSONB        NOT NULL DEFAULT '[]',       -- array of feature codes (see FeatureGuard)
    is_public            BOOLEAN      NOT NULL DEFAULT true,       -- shown on the pricing page
    sort_order           INT          NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Per-tenant subscription (one row per tenant) ───────────
-- Local projection of Stripe truth; Stripe webhooks keep status/period in sync.
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    tenant_id            VARCHAR(50)  PRIMARY KEY,
    plan_code            VARCHAR(20)  NOT NULL REFERENCES subscription_plans(code),
    status               VARCHAR(20)  NOT NULL DEFAULT 'trialing', -- trialing|active|past_due|canceled|free
    integration_mode     VARCHAR(20)  NOT NULL DEFAULT 'standalone', -- standalone|integrated (intent)
    integration_status   VARCHAR(20)  NOT NULL DEFAULT 'disconnected', -- disconnected|pending|connected|error
    seats_purchased      INT,                                      -- NULL = fall back to plan.max_drivers
    trial_ends_at        TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    stripe_customer_id    VARCHAR(64),
    stripe_subscription_id VARCHAR(64),
    extra                JSONB,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_plan ON tenant_subscriptions(plan_code);

-- ─── Seed the plan catalog ──────────────────────────────────
-- Feature codes are the keys FeatureGuard / @RequiresFeature check. Live GPS,
-- playback and route history are ALWAYS-ON core (Traccar) and are NOT gated here.
INSERT INTO subscription_plans (code, name, price_per_seat_cents, max_drivers, integration_allowed, features, sort_order) VALUES
    ('starter',  'Starter',     0,    3,    false, '["playback"]',                                           1),
    ('growth',   'Growth',      1500, NULL, false, '["playback","route_optimization","reports"]',            2),
    ('business', 'Business',    3000, NULL, true,  '["playback","route_optimization","reports","api_access"]', 3)
ON CONFLICT (code) DO NOTHING;

-- ─── Seed subscriptions for the demo tenants ────────────────
-- Demo tenants run the full MySQL/CDC stack, so they sit on Business with
-- integration turned on — consistent with tenant_settings.ingest_mode='integrated'.
-- New self-serve tenants get no row here and resolve to Starter/standalone defaults.
INSERT INTO tenant_subscriptions (tenant_id, plan_code, status, integration_mode, integration_status) VALUES
    ('tenant-1', 'business', 'active', 'integrated', 'connected'),
    ('tenant-2', 'business', 'active', 'integrated', 'connected')
ON CONFLICT (tenant_id) DO NOTHING;
