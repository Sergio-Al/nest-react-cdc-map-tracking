import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CachedCustomer } from '../sync/entities';
import { CustomerCacheService } from './customer-cache.service';

@Module({
  imports: [TypeOrmModule.forFeature([CachedCustomer], 'cacheDb')],
  providers: [CustomerCacheService],
  exports: [CustomerCacheService],
})
export class CustomersModule {}
