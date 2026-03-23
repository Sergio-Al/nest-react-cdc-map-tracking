import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', length: 50 })
  @Index()
  tenantId!: string;

  @Column({ length: 30 })
  plate!: string;

  @Column({ length: 50, default: 'van' })
  type!: string;  // van | truck | motorcycle

  @Column({ type: 'varchar', length: 100, nullable: true })
  brand!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model!: string | null;

  @Column({ type: 'int', nullable: true })
  year!: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  color!: string | null;

  @Column({ name: 'capacity_kg', type: 'numeric', precision: 8, scale: 2, nullable: true })
  capacityKg!: number | null;

  @Column({ length: 20, default: 'active' })
  @Index()
  status!: string;  // active | maintenance | inactive

  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  @Index()
  driverId!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
