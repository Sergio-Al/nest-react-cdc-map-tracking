import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Route } from './entities/route.entity';
import { PlannedVisit } from '../visits/entities/planned-visit.entity';
import { RoutesService } from './routes.service';
import { RouteOptimizerService } from './route-optimizer.service';
import { RoutesController } from './routes.controller';
import { VisitsModule } from '../visits/visits.module';
import { CustomersModule } from '../customers/customers.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Route, PlannedVisit], 'cacheDb'),
    forwardRef(() => VisitsModule),
    CustomersModule,
    SubscriptionsModule,
  ],
  controllers: [RoutesController],
  providers: [RoutesService, RouteOptimizerService],
  exports: [RoutesService, RouteOptimizerService],
})
export class RoutesModule {}
