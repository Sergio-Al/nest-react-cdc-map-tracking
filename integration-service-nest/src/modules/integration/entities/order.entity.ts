import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

/**
 * MySQL `core_business.orders` — source of truth (integrated mode).
 *
 * Mirrors `infrastructure/mysql/init/01-init.sql`. This service does not create
 * orders (they originate in the tenant's system); it only applies status-only
 * write-backs from `commands.orders`. Never enable TypeORM `synchronize`.
 */
@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Index('idx_orders_tenant')
  @Column({ name: 'tenant_id', type: 'varchar', length: 50 })
  tenantId!: string;

  @Column({ name: 'customer_id', type: 'bigint' })
  customerId!: string;

  @Column({ name: 'order_number', type: 'varchar', length: 50 })
  orderNumber!: string;

  @Column({ type: 'varchar', length: 30, default: 'pending' })
  status!: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount!: number;

  @Column({ name: 'delivery_date', type: 'date', nullable: true })
  deliveryDate!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
