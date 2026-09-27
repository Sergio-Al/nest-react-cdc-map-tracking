import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { Driver, DriverPosition } from './entities';
import { PlannedVisit } from '../visits/entities/planned-visit.entity';
import { DriverEventsService } from './driver-events.service';
import { EnrichmentModule } from '../enrichment/enrichment.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TraccarModule } from '../traccar/traccar.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, DriverPosition, PlannedVisit], 'cacheDb'),
    EnrichmentModule,
    SubscriptionsModule,
    TraccarModule,
    AuthModule,
  ],
  controllers: [DriversController],
  providers: [DriversService, DriverEventsService],
  exports: [DriversService],
})
export class DriversModule {}
