import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackingGateway } from './tracking.gateway';
import { WsBroadcastService } from './ws-broadcast.service';
import { AuthModule } from '../auth/auth.module';
import { Driver } from '../drivers/entities/driver.entity';
import { Route } from '../routes/entities/route.entity';

/**
 * WebSocket module for real-time tracking updates.
 * Provides Socket.io gateway with Redis adapter for horizontal scaling.
 * Bridges Kafka topics (gps.positions.enriched, visits.events) to WebSocket broadcasts.
 *
 * Driver/Route repos are registered here (read-only) so the gateway can verify
 * tenant ownership before letting a client join a driver:/route: room.
 */
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Driver, Route], 'cacheDb')],
  providers: [TrackingGateway, WsBroadcastService],
  exports: [TrackingGateway],
})
export class WebsocketModule {}
