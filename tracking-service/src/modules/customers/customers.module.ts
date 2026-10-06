import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CachedCustomer } from '../sync/entities';
import { SettingsModule } from '../settings/settings.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { CustomerCacheService } from './customer-cache.service';
import { CustomersController } from './customers.controller';
import { CustomerWriterResolver } from './customer-writer.resolver';
import { StandaloneCustomerWriter } from './writers/standalone-customer-writer';
import { IntegratedCustomerWriter } from './writers/integrated-customer-writer';

@Module({
  imports: [
    TypeOrmModule.forFeature([CachedCustomer], 'cacheDb'),
    SettingsModule,
    WebsocketModule,
  ],
  controllers: [CustomersController],
  providers: [
    CustomerCacheService,
    CustomerWriterResolver,
    StandaloneCustomerWriter,
    IntegratedCustomerWriter,
  ],
  exports: [CustomerCacheService],
})
export class CustomersModule {}
