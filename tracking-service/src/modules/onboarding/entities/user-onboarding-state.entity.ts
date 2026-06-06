import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Per-user acknowledgement log for onboarding flows and feature
 * announcements. One row per (user_id, item_key); absence means "not seen".
 * An event log, NOT preferences — kept separate from user_settings.
 * Owned directly by tracking-service (no MySQL/CDC).
 */
@Entity('user_onboarding_state')
export class UserOnboardingState {
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 36 })
  userId!: string;

  @PrimaryColumn({ name: 'item_key', type: 'varchar', length: 100 })
  itemKey!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 50 })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: string; // pending | completed | dismissed | snoozed

  @Column({ type: 'int', nullable: true })
  step!: number | null;

  @Column({ name: 'seen_at', type: 'timestamptz', nullable: true })
  seenAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
