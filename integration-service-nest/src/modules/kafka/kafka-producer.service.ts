import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';

/**
 * Thin Kafka producer used only to publish DLQ messages. The Kafka client
 * config mirrors `tracking-service`'s producer (same retry envelope).
 */
@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly kafka: Kafka;
  private readonly producer: Producer;

  constructor(private readonly config: ConfigService) {
    this.kafka = new Kafka({
      clientId: this.config.get<string>('kafka.clientId'),
      brokers: [this.config.get<string>('kafka.broker')!],
      retry: {
        initialRetryTime: 300,
        retries: 10,
      },
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.logger.log('Kafka producer connected');
    } catch (error) {
      this.logger.error('Failed to connect Kafka producer', error);
    }
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected');
  }

  async produce(
    topic: string,
    message: {
      key?: Buffer | string | null;
      value: Buffer | string | null;
      headers?: Record<string, string>;
    },
  ) {
    await this.producer.send({
      topic,
      messages: [
        {
          key: message.key ?? null,
          value: message.value ?? null,
          headers: message.headers,
        },
      ],
    });
  }
}
