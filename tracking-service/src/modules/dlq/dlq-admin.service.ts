import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, Admin, IHeaders } from 'kafkajs';

/** DLQ topics available for inspection */
const DLQ_TOPICS = [
  'gps.positions.dlq',
  'gps.positions.enriched.dlq',
  'visits.events.dlq',
  'cdc.dlq',
] as const;

export type DlqTopicName = (typeof DLQ_TOPICS)[number];

export interface DlqMessage {
  key?: string;
  value: string;
  headers: Record<string, string>;
  partition: number;
  offset: string;
  timestamp: string;
}

export interface DlqTopicInfo {
  topic: string;
  messageCount: number;
}

@Injectable()
export class DlqAdminService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DlqAdminService.name);
  private kafka: Kafka;
  private admin: Admin;

  constructor(private readonly config: ConfigService) {
    this.kafka = new Kafka({
      clientId: `${this.config.get<string>('kafka.clientId')}-dlq-admin`,
      brokers: [this.config.get<string>('kafka.broker')!],
    });
    this.admin = this.kafka.admin();
  }

  async onModuleInit() {
    try {
      await this.admin.connect();
    } catch (err) {
      this.logger.error('Failed to connect DLQ admin client', err);
    }
  }

  async onModuleDestroy() {
    await this.admin.disconnect();
  }

  /**
   * List all DLQ topics with their pending message counts.
   */
  async listTopics(): Promise<DlqTopicInfo[]> {
    const results: DlqTopicInfo[] = [];

    for (const topic of DLQ_TOPICS) {
      try {
        const offsets = await this.admin.fetchTopicOffsets(topic);
        // Sum across partitions: latest offset = total messages (compacted topics may differ)
        let totalMessages = 0;
        for (const partition of offsets) {
          totalMessages += Math.max(0, parseInt(partition.high, 10));
        }
        results.push({ topic, messageCount: totalMessages });
      } catch {
        // Topic might not exist yet
        results.push({ topic, messageCount: 0 });
      }
    }

    return results;
  }

  /**
   * Peek at messages in a DLQ topic without committing offsets.
   * Uses a one-off consumer that reads and disconnects.
   */
  async peekMessages(topic: DlqTopicName, limit = 20): Promise<DlqMessage[]> {
    if (!DLQ_TOPICS.includes(topic)) {
      throw new Error(`Invalid DLQ topic: ${topic}`);
    }

    const groupId = `dlq-peek-${Date.now()}`;
    const consumer = this.kafka.consumer({ groupId });
    const messages: DlqMessage[] = [];

    try {
      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: true });

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 5000); // Max 5s to read

        consumer.run({
          autoCommit: false,
          eachMessage: async ({ message, partition }) => {
            if (messages.length >= limit) {
              clearTimeout(timeout);
              resolve();
              return;
            }

            messages.push({
              key: message.key?.toString(),
              value: message.value?.toString() ?? '',
              headers: this.parseHeaders(message.headers),
              partition,
              offset: message.offset,
              timestamp: message.timestamp,
            });

            if (messages.length >= limit) {
              clearTimeout(timeout);
              resolve();
            }
          },
        });
      });
    } finally {
      await consumer.disconnect();
      // Clean up the temp consumer group
      try {
        await this.admin.deleteGroups([groupId]);
      } catch {
        // Ignore cleanup errors
      }
    }

    return messages;
  }

  /**
   * Replay DLQ messages back to their original topic.
   * Reads messages, publishes them to the original topic (from x-original-topic header),
   * then returns the count of replayed messages.
   */
  async replayMessages(
    topic: DlqTopicName,
    limit = 100,
  ): Promise<{ replayed: number; errors: number }> {
    if (!DLQ_TOPICS.includes(topic)) {
      throw new Error(`Invalid DLQ topic: ${topic}`);
    }

    const messages = await this.peekMessages(topic, limit);
    const producer = this.kafka.producer();
    let replayed = 0;
    let errors = 0;

    try {
      await producer.connect();

      for (const msg of messages) {
        const originalTopic = msg.headers['x-original-topic'];
        if (!originalTopic) {
          this.logger.warn(
            `DLQ message in ${topic} missing x-original-topic header, skipping`,
          );
          errors++;
          continue;
        }

        try {
          await producer.send({
            topic: originalTopic,
            messages: [
              {
                key: msg.key,
                value: msg.value,
                headers: {
                  'x-replayed-from': topic,
                  'x-replayed-at': new Date().toISOString(),
                },
              },
            ],
          });
          replayed++;
        } catch (err) {
          this.logger.error(
            `Failed to replay message to ${originalTopic}`,
            err,
          );
          errors++;
        }
      }
    } finally {
      await producer.disconnect();
    }

    this.logger.log(
      `Replayed ${replayed} messages from ${topic} (${errors} errors)`,
    );
    return { replayed, errors };
  }

  // ── Helpers ──────────────────────────────────────────────

  private parseHeaders(headers?: IHeaders): Record<string, string> {
    if (!headers) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (Buffer.isBuffer(value)) {
        result[key] = value.toString('utf-8');
      } else if (typeof value === 'string') {
        result[key] = value;
      }
    }
    return result;
  }
}
