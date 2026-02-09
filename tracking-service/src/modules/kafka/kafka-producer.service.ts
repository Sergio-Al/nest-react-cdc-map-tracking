import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Admin } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;
  private admin: Admin;

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
    this.admin = this.kafka.admin();
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

  async produce(topic: string, message: { key?: string; value: string; headers?: Record<string, string> }) {
    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: message.key,
            value: message.value,
            headers: message.headers,
          },
        ],
      });
    } catch (error) {
      this.logger.error(`Failed to produce to topic ${topic}`, error);
      throw error;
    }
  }

  async produceBatch(topic: string, messages: Array<{ key?: string; value: string; headers?: Record<string, string> }>) {
    try {
      await this.producer.send({
        topic,
        messages,
      });
    } catch (error) {
      this.logger.error(`Failed to produce batch to topic ${topic}`, error);
      throw error;
    }
  }

  /** Check if the broker is reachable */
  async isHealthy(): Promise<boolean> {
    try {
      await this.admin.connect();
      const topics = await this.admin.listTopics();
      await this.admin.disconnect();
      return topics.length >= 0;
    } catch {
      return false;
    }
  }
}
