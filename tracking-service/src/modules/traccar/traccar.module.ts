import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TraccarController } from './traccar.controller';
import { TraccarIngestionService } from './traccar-ingestion.service';
import { TraccarAdminService } from './traccar-admin.service';
import { TraccarSyncProcessor } from './traccar-sync.processor';
import {
  TraccarProvisioningService,
  TRACCAR_SYNC_QUEUE,
} from './traccar-provisioning.service';

@Module({
  imports: [BullModule.registerQueue({ name: TRACCAR_SYNC_QUEUE })],
  controllers: [TraccarController],
  providers: [
    TraccarIngestionService,
    TraccarAdminService,
    TraccarProvisioningService,
    TraccarSyncProcessor,
  ],
  // TraccarProvisioningService is the enqueue API DriversModule uses to sync
  // device assignments. Importing this module brings no dependency on drivers.
  exports: [TraccarIngestionService, TraccarProvisioningService],
})
export class TraccarModule {}
