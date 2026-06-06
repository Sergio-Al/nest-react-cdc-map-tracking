import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export const TRACCAR_SYNC_QUEUE = 'traccar-sync';

/** Job payloads on the traccar-sync queue. */
export type TraccarSyncJob =
  | { uniqueId: string; name: string } // 'ensure'
  | { uniqueId: string }; // 'disable'

// 8 attempts with exponential backoff (2s,4s,…,128s ≈ 4min total) so the sync
// survives a Traccar restart/outage; exhausted jobs land in the failed set
// (inspectable, recoverable via a future resync).
const JOB_OPTS = {
  attempts: 8,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: true,
  removeOnFail: 100,
};

/**
 * Enqueue API for Traccar device sync. Driver mutations call these and return
 * immediately — the actual Traccar REST call runs in a BullMQ worker with retry
 * + exponential backoff (see TraccarSyncProcessor + TraccarAdminService). Jobs
 * are idempotent, so retries/redelivery are safe.
 */
@Injectable()
export class TraccarProvisioningService {
  private readonly logger = new Logger(TraccarProvisioningService.name);
  private readonly enabled: boolean;

  constructor(
    @InjectQueue(TRACCAR_SYNC_QUEUE) private readonly queue: Queue,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('traccar.provisioningEnabled') ?? true;
  }

  /** Ensure a Traccar device exists + is enabled for this device id. */
  async ensureDevice(uniqueId: string | null | undefined, name: string): Promise<void> {
    if (!this.guard(uniqueId)) return;
    await this.queue.add('ensure', { uniqueId, name }, JOB_OPTS);
  }

  /** Disable the Traccar device for this device id (deactivate, not delete). */
  async disableDevice(uniqueId: string | null | undefined): Promise<void> {
    if (!this.guard(uniqueId)) return;
    await this.queue.add('disable', { uniqueId }, JOB_OPTS);
  }

  private guard(uniqueId: string | null | undefined): uniqueId is string {
    if (!this.enabled) {
      this.logger.debug('Traccar provisioning disabled — skipping sync');
      return false;
    }
    return !!uniqueId;
  }
}
