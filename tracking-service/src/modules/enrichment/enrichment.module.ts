import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnrichmentService } from './enrichment.service';
import { Driver } from '../drivers/entities/driver.entity';
import { DriverPosition } from '../drivers/entities/driver-position.entity';
import { CustomersModule } from '../customers/customers.module';
import { VisitsModule } from '../visits/visits.module';
import { RoutesModule } from '../routes/routes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, DriverPosition], 'cacheDb'),
    CustomersModule,
    VisitsModule,
    RoutesModule,
  ],
  providers: [EnrichmentService],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
