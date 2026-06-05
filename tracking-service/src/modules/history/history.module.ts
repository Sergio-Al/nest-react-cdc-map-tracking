import { Module } from '@nestjs/common';
import { HistoryController } from './history.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule],
  controllers: [HistoryController],
})
export class HistoryModule {}
