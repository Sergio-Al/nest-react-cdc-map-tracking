import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * One subscription row per tenant — the local projection of Stripe truth
 * (Stripe webhooks keep status/period current). Owned directly by
 * tracking-service in PG; not in MySQL, not CDC'd.
 *
 * `integrationMode` is the billing-level INTENT (has the tenant turned the
 * integration upsell on). The operational write switch the order path branches
 * on remains `tenant_settings.ingest_mode`; EntitlementsService gates flipping
 * that to 'integrated' on the plan's `integrationAllowed`.
 */
@Entity('tenant_subscriptions')
export class TenantSubscription {
  @PrimaryColumn({ name: 'tenant_id', type: 'varchar', length: 50 })
  tenantId!: string;

  @Column({ name: 'plan_code', type: 'varchar', length: 20 })
  planCode!: string;

  // trialing | active | past_due | canceled | free
  @Column({ type: 'varchar', length: 20, default: 'trialing' })
  status!: string;

  // standalone | integrated (intent)
  @Column({ name: 'integration_mode', type: 'varchar', length: 20, default: 'standalone' })
  integrationMode!: string;

  // disconnected | pending | connected | error
  @Column({ name: 'integration_status', type: 'varchar', length: 20, default: 'disconnected' })
  integrationStatus!: string;

  // NULL = fall back to plan.maxDrivers for the seat cap.
  @Column({ name: 'seats_purchased', type: 'int', nullable: true })
  seatsPurchased!: number | null;

  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt!: Date | null;

  @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
  currentPeriodEnd!: Date | null;

  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 64, nullable: true })
  stripeCustomerId!: string | null;

  @Column({ name: 'stripe_subscription_id', type: 'varchar', length: 64, nullable: true })
  stripeSubscriptionId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  extra!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
