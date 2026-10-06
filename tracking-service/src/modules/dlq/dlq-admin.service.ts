import { PipelineTraceService } from '../pipeline/pipeline-trace.service';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, Admin, IHeaders } from 'kafkajs';

/** DLQ topics available for inspection */
const DLQ_TOPICS = [
  'gps.positions.dlq',
  'gps.positions.enriched.dlq',
  'visits.events.dlq',
  'cdc.dlq',
  'commands.customers.dlq',
  'commands.orders.dlq',
  'commands.drivers.dlq',
] as const;

export type DlqTopicName = (typeof DLQ_TOPICS)[number];

export interface DlqMessage {
  key?: string;
  value: string;
  headers: Record<string, string>;
  partition: number;
  offset: string;
  timestamp: string;
  /** True once this record has been replayed (its offset is behind the replay cursor). */
  replayed?: boolean;
}

export interface DlqTopicInfo {
  topic: string;
  /** Records retained in Kafka (replaying never deletes them). */
  messageCount: number;
  /** Records not replayed yet. */
  pendingCount: number;
}

/** How many retained records a replay scans looking for pending ones. */
const REPLAY_SCAN_LIMIT = 1000;

@Injectable()
export class DlqAdminService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DlqAdminService.name);
  private kafka: Kafka;
  private admin: Admin;

  constructor(private readonly config: ConfigService, private readonly traces: PipelineTraceService) {
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
        const cursor = await this.replayCursor(topic);
        // Sum across partitions: latest offset = total messages (compacted topics may differ)
        let totalMessages = 0;
        let pending = 0;
        for (const partition of offsets) {
          const high = parseInt(partition.high, 10);
          const low = parseInt(partition.low ?? '0', 10);
          totalMessages += Math.max(0, high);
          pending += Math.max(0, high - Math.max(low, cursor.get(partition.partition) ?? 0));
        }
        results.push({ topic, messageCount: totalMessages, pendingCount: pending });
      } catch {
        // Topic might not exist yet
        results.push({ topic, messageCount: 0, pendingCount: 0 });
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

    const cursor = await this.replayCursor(topic);
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
              replayed: Number(message.offset) < (cursor.get(partition) ?? 0),
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
   * Replay DLQ messages back to their original topic. Only records that were not
   * replayed before are sent: a per-queue consumer group (`dlq-replay-<topic>`)
   * is used as a cursor, and its committed offset advances past each record once
   * it is re-published. A record that fails to send stops its partition so it is
   * retried, in order, on the next replay.
   * Command queues map to their source by stripping .dlq; other queues use
   * x-original-topic (required for the shared CDC queue).
   * Returns the counts of replayed messages and errors.
   */
  async replayMessages(
    topic: DlqTopicName,
    limit = 100,
  ): Promise<{ replayed: number; errors: number }> {
    if (!DLQ_TOPICS.includes(topic)) {
      throw new Error(`Invalid DLQ topic: ${topic}`);
    }

    const messages = (await this.peekMessages(topic, REPLAY_SCAN_LIMIT))
      .filter((msg) => !msg.replayed)
      .slice(0, limit);
    if (messages.length === 0) return { replayed: 0, errors: 0 };

    const producer = this.kafka.producer();
    const advanced = new Map<number, number>();
    const blocked = new Set<number>();
    let replayed = 0;
    let errors = 0;

    try {
      await producer.connect();

      for (const msg of messages) {
        if (blocked.has(msg.partition)) continue;
        const originalTopic = topic.startsWith('commands.')
          ? topic.slice(0, -'.dlq'.length)
          : msg.headers['x-original-topic'];
        if (!originalTopic) {
          this.logger.warn(
            `DLQ message in ${topic} missing x-original-topic header, skipping`,
          );
          errors++;
          // Unroutable forever: move the cursor past it instead of blocking the partition.
          advanced.set(msg.partition, Number(msg.offset) + 1);
          continue;
        }

        try {
          const replayedAt = new Date().toISOString();
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
          advanced.set(msg.partition, Number(msg.offset) + 1);
          if (topic.startsWith('commands.')) {
            try {
              const command = JSON.parse(msg.value);
              if (command.correlationId) await this.traces.append(command.correlationId, 'dlq.replayed', undefined, replayedAt);
            } catch (err) {
              this.logger.warn(`Replay trace unavailable: ${(err as Error).message}`);
            }
          }
        } catch (err) {
          this.logger.error(
            `Failed to replay message to ${originalTopic}`,
            err,
          );
          errors++;
          blocked.add(msg.partition);
        }
      }
    } finally {
      await producer.disconnect();
      if (advanced.size > 0) {
        await this.admin.setOffsets({
          groupId: this.replayGroup(topic),
          topic,
          partitions: [...advanced].map(([partition, offset]) => ({ partition, offset: String(offset) })),
        });
      }
    }

    this.logger.log(
      `Replayed ${replayed} messages from ${topic} (${errors} errors)`,
    );
    return { replayed, errors };
  }

  // ── Helpers ──────────────────────────────────────────────

  private replayGroup(topic: string): string {
    return `dlq-replay-${topic}`;
  }

  /** Next offset to replay per partition (0 when the queue was never replayed). */
  private async replayCursor(topic: string): Promise<Map<number, number>> {
    const cursor = new Map<number, number>();
    const offsets = await this.admin.fetchOffsets({ groupId: this.replayGroup(topic), topics: [topic] });
    for (const { partition, offset } of offsets[0]?.partitions ?? []) {
      cursor.set(partition, Math.max(0, Number(offset)));
    }
    return cursor;
  }

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
