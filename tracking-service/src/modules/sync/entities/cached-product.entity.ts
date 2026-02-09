import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('products_cache')
export class CachedProduct {
  @PrimaryColumn({ type: 'bigint' })
  id!: number;

  @Column({ name: 'tenant_id', type: 'varchar', length: 50 })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  sku!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category!: string | null;

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 2, default: 0 })
  unitPrice!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ name: 'synced_at', type: 'timestamptz', default: () => 'NOW()' })
  syncedAt!: Date;
}
