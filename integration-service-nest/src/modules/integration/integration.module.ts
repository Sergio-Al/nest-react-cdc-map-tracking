import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerEntity } from './entities/customer.entity';
import { DriverEntity } from './entities/driver.entity';
import { CustomersHandler } from './customers.handler';
import { DriversHandler } from './drivers.handler';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerEntity, DriverEntity])],
  providers: [CustomersHandler, DriversHandler],
})
export class IntegrationModule {}
