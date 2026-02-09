import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('cached_users')
export class CachedUser {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  email: string;

  @Column()
  password: string;

  @Column()
  name: string;

  @Column()
  role: string; // 'admin' | 'dispatcher' | 'driver'

  @Column({ name: 'driver_id', type: 'varchar', nullable: true })
  driverId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
