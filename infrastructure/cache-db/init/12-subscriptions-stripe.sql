-- ═══════════════════════════════════════════════════════════════
-- Stripe billing wiring for subscriptions (additive to 11-subscriptions.sql)
-- ═══════════════════════════════════════════════════════════════
-- Maps a Stripe Price to a local plan so the webhook can resolve which plan a
-- subscription is on from the price id on its line item. Set these to your real
-- Stripe price ids once the products exist; until then they stay NULL and the
-- webhook leaves plan_code unchanged for unknown prices.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_price
    ON subscription_plans(stripe_price_id);
