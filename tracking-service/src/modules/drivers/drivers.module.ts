import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { Driver, DriverPosition } from './entities';
import { EnrichmentModule } from '../enrichment/enrichment.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TraccarModule } from '../traccar/traccar.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, DriverPosition], 'cacheDb'),
    EnrichmentModule,
    SubscriptionsModule,
    TraccarModule,
    AuthModule,
  ],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
