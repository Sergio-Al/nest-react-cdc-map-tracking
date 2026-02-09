import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('customers_cache')
export class CachedCustomer {
  @PrimaryColumn({ type: 'bigint' })
  id!: number;

  @Column({ name: 'tenant_id', type: 'varchar', length: 50 })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address!: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  @Column({ name: 'geofence_radius_meters', type: 'int', default: 100 })
  geofenceRadiusMeters!: number;

  @Column({ name: 'customer_type', type: 'varchar', length: 50, default: 'regular' })
  customerType!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ name: 'synced_at', type: 'timestamptz', default: () => 'NOW()' })
  syncedAt!: Date;
}
