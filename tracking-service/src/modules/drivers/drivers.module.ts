import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { Driver, DriverPosition } from './entities';

@Module({
  imports: [TypeOrmModule.forFeature([Driver, DriverPosition], 'cacheDb')],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
