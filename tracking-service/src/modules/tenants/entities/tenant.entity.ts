import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * The workspace registry — authoritative list of tenants and the uniqueness
 * anchor for self-serve signup. PG-owned (written directly by tracking-service,
 * not synced from MySQL/CDC). `id` is the tenantId/slug users type at login.
 */
@Entity('tenants')
export class Tenant {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'owner_email', type: 'varchar', length: 255 })
  ownerEmail!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
