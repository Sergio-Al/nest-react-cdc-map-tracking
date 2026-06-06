-- ═══════════════════════════════════════════════════════════════
-- Onboarding & announcements — per-user acknowledgement log
-- ═══════════════════════════════════════════════════════════════
-- Owned and written DIRECTLY by tracking-service (like settings/
-- vehicles/routes) — NOT synced from MySQL/CDC.
--
-- This is an EVENT LOG, not preferences: one row per (user, item_key).
-- An item_key is any onboarding flow or feature announcement the user
-- acknowledges once (e.g. 'welcome_v1', 'feature_route_playback').
-- Shipping a new announcement = a new item_key, no schema change.
-- Absence of a row means "not seen yet".

CREATE TABLE IF NOT EXISTS user_onboarding_state (
    user_id      VARCHAR(36)  NOT NULL,
    item_key     VARCHAR(100) NOT NULL,                       -- stable key per flow/announcement
    tenant_id    VARCHAR(50)  NOT NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'pending',     -- pending | completed | dismissed | snoozed
    step         INT,                                         -- resume point for multi-step flows
    seen_at      TIMESTAMPTZ,                                 -- last interaction time
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_onboarding_tenant ON user_onboarding_state(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_item   ON user_onboarding_state(item_key);
