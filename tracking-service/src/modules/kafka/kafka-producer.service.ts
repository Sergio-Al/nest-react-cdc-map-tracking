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
  /** Short-lived cache so the public /api/health endpoint can't be used to
   *  hammer the broker with admin connect/disconnect churn. */
  private healthCache: { value: boolean; expires: number } | null = null;

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

  /** Check if the broker is reachable (cached ~10s to avoid admin churn). */
  async isHealthy(): Promise<boolean> {
    const now = Date.now();
    if (this.healthCache && this.healthCache.expires > now) {
      return this.healthCache.value;
    }
    let ok = false;
    try {
      await this.admin.connect();
      const topics = await this.admin.listTopics();
      await this.admin.disconnect();
      ok = topics.length >= 0;
    } catch {
      ok = false;
    }
    this.healthCache = { value: ok, expires: now + 10000 };
    return ok;
  }
}
