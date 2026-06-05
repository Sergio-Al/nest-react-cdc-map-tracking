import { Entity, PrimaryColumn, Column, Index, UpdateDateColumn } from 'typeorm';

/**
 * Per-user preference overrides. A NULL column means "inherit the tenant
 * default" (see SettingsService.getEffective). `theme`/`density` are
 * user-only (no tenant layer). Owned directly by tracking-service.
 */
@Entity('user_settings')
export class UserSettings {
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 36 })
  userId!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 50 })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  locale!: string | null;

  @Column({ name: 'date_format', type: 'varchar', length: 32, nullable: true })
  dateFormat!: string | null;

  @Column({ name: 'number_format', type: 'varchar', length: 20, nullable: true })
  numberFormat!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  units!: string | null;

  @Column({ name: 'default_report_preset', type: 'varchar', length: 10, nullable: true })
  defaultReportPreset!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  theme!: string | null; // light | dark | system

  @Column({ type: 'varchar', length: 15, nullable: true })
  density!: string | null; // comfortable | compact

  @Column({ type: 'jsonb', nullable: true })
  extra!: Record<string, unknown> | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
