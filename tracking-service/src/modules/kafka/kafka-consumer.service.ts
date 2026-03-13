import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { DlqService } from './dlq.service';
import { RetryPolicy, KafkaProcessingError } from './interfaces/kafka-error.interface';

export interface KafkaMessageHandler {
  topic: string;
  fromBeginning?: boolean;
  handler: (payload: EachMessagePayload) => Promise<void>;
  /** Optional retry policy. When provided, failed messages are retried then sent to DLQ. */
  retryPolicy?: RetryPolicy;
}

@Injectable()
export class KafkaConsumerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private handlers: KafkaMessageHandler[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly dlqService: DlqService,
  ) {
    this.kafka = new Kafka({
      clientId: this.config.get<string>('kafka.clientId'),
      brokers: [this.config.get<string>('kafka.broker')!],
      retry: {
        initialRetryTime: 300,
        retries: 10,
      },
    });
    this.consumer = this.kafka.consumer({
      groupId: this.config.get<string>('kafka.groupId')!,
    });
  }

  /**
   * Register a handler for a topic. Must be called before onApplicationBootstrap.
   */
  registerHandler(topicHandler: KafkaMessageHandler) {
    this.handlers.push(topicHandler);
  }

  async onApplicationBootstrap() {
    if (this.handlers.length === 0) {
      this.logger.warn('No Kafka consumer handlers registered – skipping consumer start');
      return;
    }

    try {
      await this.consumer.connect();
      this.logger.log('Kafka consumer connected');

      // Subscribe to all registered topics
      for (const { topic, fromBeginning } of this.handlers) {
        await this.consumer.subscribe({ topic, fromBeginning: fromBeginning ?? false });
        this.logger.log(`Subscribed to topic: ${topic} (fromBeginning=${fromBeginning ?? false})`);
      }

      await this.consumer.run({
        eachMessage: async (payload) => {
          const { topic, partition, message } = payload;
          const handler = this.handlers.find((h) => h.topic === topic);
          if (!handler) return;

          if (handler.retryPolicy) {
            // ── Retry-aware processing with DLQ fallback ──
            const retryResult = await this.dlqService.withRetry(
              () => handler.handler(payload),
              handler.retryPolicy,
            );

            if (!retryResult.success) {
              const errorInfo: KafkaProcessingError = {
                topic,
                partition,
                offset: message.offset,
                key: message.key?.toString(),
                error: retryResult.error.message,
                errorStack: retryResult.error.stack,
                retryCount: retryResult.retryCount,
                sentToDlq: true,
                timestamp: new Date().toISOString(),
              };

              this.logger.error(
                `Message failed after ${retryResult.retryCount} retries → DLQ | ` +
                  `topic=${topic} partition=${partition} offset=${message.offset}: ${retryResult.error.message}`,
              );

              await this.dlqService.publishToDlq(
                topic,
                message.key?.toString(),
                message.value?.toString(),
                retryResult.error,
                { partition, offset: message.offset, retryCount: retryResult.retryCount },
              );
            }
          } else {
            // ── Legacy processing (log-and-swallow, no DLQ) ──
            try {
              await handler.handler(payload);
            } catch (error) {
              this.logger.error(
                `Error processing message from topic ${topic} partition ${partition} offset ${message.offset}`,
                error,
              );
            }
          }
        },
      });
    } catch (error) {
      this.logger.error('Failed to start Kafka consumer', error);
    }
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
    this.logger.log('Kafka consumer disconnected');
  }
}
