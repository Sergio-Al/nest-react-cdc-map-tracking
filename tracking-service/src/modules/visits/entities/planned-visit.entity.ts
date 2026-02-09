import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Route } from '../../routes/entities/route.entity';

@Entity('planned_visits')
export class PlannedVisit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', length: 50 })
  @Index()
  tenantId!: string;

  @Column({ name: 'route_id', type: 'uuid' })
  @Index()
  routeId!: string;

  @Column({ name: 'driver_id', type: 'uuid' })
  @Index()
  driverId!: string;

  @Column({ name: 'customer_id', type: 'bigint' })
  @Index()
  customerId!: number;

  @Column({ name: 'sequence_number', type: 'int' })
  sequenceNumber!: number;

  @Column({ name: 'visit_type', length: 30, default: 'delivery' })
  visitType!: string; // delivery | pickup | service

  @Column({ name: 'scheduled_date', type: 'date' })
  @Index()
  scheduledDate!: string;

  @Column({ name: 'time_window_start', type: 'time', nullable: true })
  timeWindowStart!: string | null;

  @Column({ name: 'time_window_end', type: 'time', nullable: true })
  timeWindowEnd!: string | null;

  @Column({ length: 20, default: 'pending' })
  status!: string; // pending | en_route | arrived | in_progress | completed | skipped | failed

  @Column({ name: 'arrived_at', type: 'timestamptz', nullable: true })
  arrivedAt!: Date | null;

  @Column({ name: 'departed_at', type: 'timestamptz', nullable: true })
  departedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Route, (route) => route.visits)
  @JoinColumn({ name: 'route_id' })
  route?: Route;
}
