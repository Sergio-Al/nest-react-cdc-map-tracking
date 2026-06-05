import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerEntity } from './entities/customer.entity';
import { DriverEntity } from './entities/driver.entity';
import { OrderEntity } from './entities/order.entity';
import { CustomersHandler } from './customers.handler';
import { DriversHandler } from './drivers.handler';
import { OrdersHandler } from './orders.handler';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerEntity, DriverEntity, OrderEntity])],
  providers: [CustomersHandler, DriversHandler, OrdersHandler],
})
export class IntegrationModule {}
