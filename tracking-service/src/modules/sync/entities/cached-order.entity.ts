import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

/**
 * `orders_cache` — dual-purpose depending on the tenant's ingest_mode:
 *   • integrated → PostgreSQL read model for MySQL `core_business.orders`, kept
 *     current by the CDC consumer (cdc.orders); `id` mirrors the MySQL bigint PK.
 *   • standalone → the OWNER (source of truth), written directly by OrdersService;
 *     `id` is assigned by the `orders_cache_id_seq` DB default on insert.
 * Kept as @PrimaryColumn (not generated) so CDC upserts can set an explicit id.
 */
@Entity('orders_cache')
export class CachedOrder {
  @PrimaryColumn({ type: 'bigint' })
  id!: number;

  @Column({ name: 'tenant_id', type: 'varchar', length: 50 })
  @Index()
  tenantId!: string;

  @Column({ name: 'customer_id', type: 'bigint' })
  @Index()
  customerId!: number;

  @Column({ name: 'order_number', type: 'varchar', length: 50 })
  orderNumber!: string;

  @Column({ type: 'varchar', length: 30, default: 'pending' })
  status!: string;

  @Column({ name: 'total_amount', type: 'double precision', default: 0 })
  totalAmount!: number;

  @Column({ name: 'delivery_date', type: 'date', nullable: true })
  deliveryDate!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt!: Date;

  @Column({ name: 'synced_at', type: 'timestamptz', default: () => 'NOW()' })
  syncedAt!: Date;
}
