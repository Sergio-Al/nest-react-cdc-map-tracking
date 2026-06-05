import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Plan catalog. Owned directly by tracking-service (PG `tracking_cache`),
 * not synced from MySQL. A handful of rows (starter|growth|business).
 *
 * `integrationAllowed` is the capability gate for the integration upsell;
 * `features` is the list of feature codes a tier unlocks (checked by
 * @RequiresFeature / FeatureGuard). Live GPS/playback/route-history are
 * always-on core and are NOT listed/gated here.
 */
@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  code!: string; // starter | growth | business

  @Column({ type: 'varchar', length: 60 })
  name!: string;

  @Column({ name: 'price_per_seat_cents', type: 'int', default: 0 })
  pricePerSeatCents!: number;

  // NULL = unlimited drivers (per-seat billed).
  @Column({ name: 'max_drivers', type: 'int', nullable: true })
  maxDrivers!: number | null;

  @Column({ name: 'integration_allowed', type: 'boolean', default: false })
  integrationAllowed!: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  features!: string[];

  // Maps this plan to a Stripe Price so the webhook can resolve plan_code from
  // a subscription's line item. NULL until the Stripe products are created.
  @Column({ name: 'stripe_price_id', type: 'varchar', length: 64, nullable: true })
  stripePriceId!: string | null;

  @Column({ name: 'is_public', type: 'boolean', default: true })
  isPublic!: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
