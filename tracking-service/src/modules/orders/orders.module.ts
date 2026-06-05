import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CachedOrder } from '../sync/entities/cached-order.entity';
import { SettingsModule } from '../settings/settings.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderWriterResolver } from './order-writer.resolver';
import { StandaloneOrderWriter } from './writers/standalone-order-writer';
import { IntegratedOrderWriter } from './writers/integrated-order-writer';

/**
 * Mode-aware orders. Reads come from orders_cache; writes are routed per tenant
 * (standalone → direct PG; integrated → commands.orders Kafka). KafkaProducerService
 * is provided by the global KafkaModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CachedOrder], 'cacheDb'), SettingsModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderWriterResolver,
    StandaloneOrderWriter,
    IntegratedOrderWriter,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
