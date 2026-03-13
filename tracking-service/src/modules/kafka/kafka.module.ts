import { Module, Global } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { DlqService } from './dlq.service';

@Global()
@Module({
  providers: [KafkaProducerService, KafkaConsumerService, DlqService],
  exports: [KafkaProducerService, KafkaConsumerService, DlqService],
})
export class KafkaModule {}
