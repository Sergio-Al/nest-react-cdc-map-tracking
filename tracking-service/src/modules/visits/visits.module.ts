import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlannedVisit } from './entities/planned-visit.entity';
import { VisitsService } from './visits.service';
import { VisitsController } from './visits.controller';
import { RoutesModule } from '../routes/routes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlannedVisit], 'cacheDb'),
    forwardRef(() => RoutesModule),
  ],
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
