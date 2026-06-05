import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

/**
 * MySQL `core_business.customers` — source of truth.
 *
 * Mirrors `infrastructure/mysql/init/01-init.sql`. `id` is AUTO_INCREMENT;
 * `geofence_radius_meters`, `customer_type`, `active`, `created_at`, `updated_at`
 * are populated by MySQL defaults and never set on insert.
 */
@Entity('customers')
export class CustomerEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Index('idx_customers_tenant')
  @Column({ name: 'tenant_id', type: 'varchar', length: 50 })
  tenantId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  zone!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: number | null;

  @Column({ name: 'geofence_radius_meters', type: 'int', default: 100 })
  geofenceRadiusMeters!: number;

  @Column({ name: 'customer_type', type: 'varchar', length: 50, default: 'regular' })
  customerType!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}
