import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('sync_state')
export class SyncState {
  @PrimaryColumn({ name: 'table_name', type: 'varchar', length: 100 })
  tableName!: string;

  @Column({ name: 'last_offset', type: 'varchar', length: 200, nullable: true })
  lastOffset!: string | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', default: () => 'NOW()' })
  lastSyncedAt!: Date;

  @Column({ type: 'varchar', length: 20, default: 'idle' })
  status!: string;
}
