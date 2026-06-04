import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { MetricsService } from '../metrics/metrics.service';

export interface KafkaMessageHandler {
  topic: string;
  fromBeginning?: boolean;
  /**
   * Process one message. The handler owns its own retry + DLQ behaviour and
   * MUST resolve (never throw) so the offset advances — mirroring the Go
   * runner, which commits after the handler returns regardless of outcome.
   */
  handler: (payload: EachMessagePayload) => Promise<void>;
}

/**
 * Single shared consumer (group `integration-service-group`) subscribed to all
 * registered command topics. Handlers register themselves on construction;
 * the consumer connects once on application bootstrap.
 */
@Injectable()
export class KafkaConsumerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly handlers: KafkaMessageHandler[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
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
      // If the consumer crashes after a successful start (e.g. a transient
      // broker error), keep restarting it instead of dying — the Go reader
      // self-healed by looping on FetchMessage; this preserves that behaviour.
      retry: { restartOnFailure: async () => true },
    });
  }

  /** Register a topic handler. Must be called before onApplicationBootstrap. */
  registerHandler(handler: KafkaMessageHandler) {
    this.handlers.push(handler);
  }

  async onApplicationBootstrap() {
    if (this.handlers.length === 0) {
      this.logger.warn('No Kafka handlers registered – consumer not started');
      return;
    }
    // Start in the background with retry so a transient startup error (e.g.
    // "This server does not host this topic-partition" during single-broker
    // metadata propagation) doesn't permanently kill the consumer.
    void this.startWithRetry();
  }

  private async startWithRetry() {
    const maxAttempts = 12;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.start();
        return; // run() resolved → consumer is live, processing in background
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to start Kafka consumer (attempt ${attempt}/${maxAttempts}): ${message}`,
        );
        // Reset the (possibly half-connected) consumer before retrying.
        try {
          await this.consumer.disconnect();
        } catch {
          // ignore — may not have connected
        }
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        await this.sleep(delay);
      }
    }
    this.logger.error(
      `Kafka consumer did not start after ${maxAttempts} attempts — giving up`,
    );
  }

  private async start() {
    await this.consumer.connect();
    this.logger.log('Kafka consumer connected');

    for (const { topic, fromBeginning } of this.handlers) {
      await this.consumer.subscribe({
        topic,
        fromBeginning: fromBeginning ?? false,
      });
      this.logger.log(`Subscribed to topic: ${topic}`);
    }

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const handler = this.handlers.find((h) => h.topic === payload.topic);
        if (!handler) return;

        try {
          await handler.handler(payload);
        } catch (error) {
          // Handlers are expected to be exhaustive; this is a last-resort
          // guard so one bad message never crashes the consumer loop.
          this.logger.error(
            `Unhandled error processing ${payload.topic}@${payload.message.offset}`,
            error,
          );
        } finally {
          this.metrics.addProcessed(payload.topic);
        }
      },
    });
    this.logger.log('Kafka consumer running');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onModuleDestroy() {
    try {
      await this.consumer.disconnect();
      this.logger.log('Kafka consumer disconnected');
    } catch {
      // already disconnected
    }
  }
}
