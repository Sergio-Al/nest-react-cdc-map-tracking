import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
} from 'typeorm';

@Entity('driver_positions')
export class DriverPosition {
  @PrimaryColumn({ name: 'driver_id', type: 'uuid' })
  driverId!: string;

  @Column({ name: 'tenant_id', length: 50 })
  @Index()
  tenantId!: string;

  @Column({ type: 'double precision' })
  latitude!: number;

  @Column({ type: 'double precision' })
  longitude!: number;

  @Column({ type: 'double precision', default: 0 })
  speed!: number;

  @Column({ type: 'double precision', default: 0 })
  heading!: number;

  @Column({ type: 'double precision', default: 0 })
  altitude!: number;

  @Column({ type: 'float8', nullable: true })
  accuracy!: number | null;

  @Column({ name: 'current_route_id', type: 'uuid', nullable: true })
  currentRouteId!: string | null;

  @Column({ name: 'current_visit_id', type: 'uuid', nullable: true })
  currentVisitId!: string | null;

  @Column({ name: 'next_visit_id', type: 'uuid', nullable: true })
  nextVisitId!: string | null;

  @Column({ name: 'distance_to_next_m', type: 'float8', nullable: true })
  distanceToNextM!: number | null;

  @Column({ name: 'eta_to_next_sec', type: 'int', nullable: true })
  etaToNextSec!: number | null;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt!: Date;
}
