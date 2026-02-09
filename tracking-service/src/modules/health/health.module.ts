import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { WebsocketModule } from '../websocket/websocket.module';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [WebsocketModule, SyncModule],
  controllers: [HealthController],
})
export class HealthModule {}
