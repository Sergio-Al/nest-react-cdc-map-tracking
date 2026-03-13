import { Module } from '@nestjs/common';
import { DlqController } from './dlq.controller';
import { DlqAdminService } from './dlq-admin.service';

@Module({
  controllers: [DlqController],
  providers: [DlqAdminService],
  exports: [DlqAdminService],
})
export class DlqModule {}
