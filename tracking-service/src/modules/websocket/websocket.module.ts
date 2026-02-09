import { Module } from '@nestjs/common';
import { TrackingGateway } from './tracking.gateway';
import { WsBroadcastService } from './ws-broadcast.service';
import { AuthModule } from '../auth/auth.module';

/**
 * WebSocket module for real-time tracking updates.
 * Provides Socket.io gateway with Redis adapter for horizontal scaling.
 * Bridges Kafka topics (gps.positions.enriched, visits.events) to WebSocket broadcasts.
 */
@Module({
  imports: [AuthModule],
  providers: [TrackingGateway, WsBroadcastService],
  exports: [TrackingGateway],
})
export class WebsocketModule {}
