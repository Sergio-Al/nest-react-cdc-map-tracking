import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { PlannedVisit } from '../../visits/entities/planned-visit.entity';

@Entity('routes')
export class Route {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', length: 50 })
  @Index()
  tenantId!: string;

  @Column({ name: 'driver_id', type: 'uuid' })
  @Index()
  driverId!: string;

  @Column({ name: 'scheduled_date', type: 'date' })
  @Index()
  scheduledDate!: string;

  @Column({ length: 20, default: 'planned' })
  status!: string; // planned | in_progress | completed | cancelled

  @Column({ name: 'total_stops', type: 'int', default: 0 })
  totalStops!: number;

  @Column({ name: 'completed_stops', type: 'int', default: 0 })
  completedStops!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => PlannedVisit, (visit) => visit.route)
  visits?: PlannedVisit[];
}
