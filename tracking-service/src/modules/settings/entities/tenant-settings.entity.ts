import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * Per-tenant default preferences. Owned directly by tracking-service
 * (written to the PG cache, not synced from MySQL). One row per tenant.
 */
@Entity('tenant_settings')
export class TenantSettings {
  @PrimaryColumn({ name: 'tenant_id', type: 'varchar', length: 50 })
  tenantId!: string;

  @Column({ type: 'varchar', length: 64, default: 'America/La_Paz' })
  timezone!: string;

  @Column({ type: 'varchar', length: 10, default: 'es' })
  locale!: string;

  @Column({ name: 'date_format', type: 'varchar', length: 32, default: 'dd/MM/yyyy' })
  dateFormat!: string;

  @Column({ name: 'number_format', type: 'varchar', length: 20, default: 'es-BO' })
  numberFormat!: string;

  @Column({ type: 'varchar', length: 10, default: 'metric' })
  units!: string;

  @Column({ name: 'default_report_preset', type: 'varchar', length: 10, default: '14d' })
  defaultReportPreset!: string;

  @Column({ type: 'jsonb', nullable: true })
  extra!: Record<string, unknown> | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
