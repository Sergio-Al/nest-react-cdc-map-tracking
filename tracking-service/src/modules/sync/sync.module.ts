import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CdcConsumerService } from './cdc-consumer.service';
import { CdcMetricsService } from './cdc-metrics.service';
import { SyncController } from './sync.controller';
import {
  CachedAccount,
  CachedCustomer,
  CachedProduct,
  CachedOrder,
  SyncState,
} from './entities';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CachedAccount,
      CachedCustomer,
      CachedProduct,
      CachedOrder,
      SyncState,
    ], 'cacheDb'),
    forwardRef(() => WebsocketModule),
  ],
  controllers: [SyncController],
  providers: [CdcConsumerService, CdcMetricsService],
  exports: [CdcConsumerService, CdcMetricsService],
})
export class SyncModule {}
