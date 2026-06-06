import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TraccarAdminService } from './traccar-admin.service';
import { TRACCAR_SYNC_QUEUE } from './traccar-provisioning.service';

/**
 * Worker for the traccar-sync queue. Concurrency 1 keeps jobs FIFO (the volume
 * is tiny and ordering for the same uniqueId matters: e.g. disable-old then
 * ensure-new). A thrown error triggers BullMQ retry/backoff; once attempts are
 * exhausted the job lands in the failed set (inspectable, DLQ-like).
 */
@Processor(TRACCAR_SYNC_QUEUE, { concurrency: 1 })
export class TraccarSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(TraccarSyncProcessor.name);

  constructor(private readonly admin: TraccarAdminService) {
    super();
  }

  async process(job: Job<{ uniqueId: string; name?: string }>): Promise<void> {
    const { uniqueId, name } = job.data;
    if (job.name === 'ensure') {
      await this.admin.ensureDevice(uniqueId, name ?? uniqueId);
    } else if (job.name === 'disable') {
      await this.admin.disableDevice(uniqueId);
    } else {
      this.logger.warn(`Unknown traccar-sync job: ${job.name}`);
    }
  }
}
