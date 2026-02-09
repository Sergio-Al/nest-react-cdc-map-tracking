import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', length: 50 })
  @Index()
  tenantId!: string;

  @Column({ name: 'device_id', type: 'varchar', length: 100, nullable: true })
  @Index()
  deviceId!: string | null;

  @Column({ length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ name: 'vehicle_plate', type: 'varchar', length: 30, nullable: true })
  vehiclePlate!: string | null;

  @Column({ name: 'vehicle_type', length: 50, default: 'van' })
  vehicleType!: string;

  @Column({ length: 20, default: 'offline' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
