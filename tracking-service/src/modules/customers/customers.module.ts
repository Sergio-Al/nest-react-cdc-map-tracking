import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CachedCustomer } from '../sync/entities';
import { CustomerCacheService } from './customer-cache.service';
import { CustomersController } from './customers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CachedCustomer], 'cacheDb')],
  controllers: [CustomersController],
  providers: [CustomerCacheService],
  exports: [CustomerCacheService],
})
export class CustomersModule {}
