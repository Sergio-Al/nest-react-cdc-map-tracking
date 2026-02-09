import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('accounts_cache')
export class CachedAccount {
  @PrimaryColumn({ type: 'bigint' })
  id!: number;

  @Column({ name: 'tenant_id', type: 'varchar', length: 50 })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'account_type', type: 'varchar', length: 50, default: 'standard' })
  accountType!: string;

  @Column({ type: 'jsonb', nullable: true })
  settings!: Record<string, unknown> | null;

  @Column({ name: 'synced_at', type: 'timestamptz', default: () => 'NOW()' })
  syncedAt!: Date;
}
