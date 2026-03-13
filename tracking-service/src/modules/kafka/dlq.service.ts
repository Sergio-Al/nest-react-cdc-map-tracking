import { Injectable, Logger } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import {
  KafkaProcessingError,
  RetryPolicy,
  isTransientError,
} from './interfaces/kafka-error.interface';

/** Default DLQ topic suffix */
const DLQ_SUFFIX = '.dlq';

/** CDC topics share a single DLQ */
const CDC_DLQ_TOPIC = 'cdc.dlq';

/** Topics that route to the shared CDC DLQ */
const CDC_TOPICS = new Set([
  'cdc.accounts',
  'cdc.customers',
  'cdc.products',
  'cdc.orders',
  'cdc.users',
]);

/**
 * Dead-Letter Queue service.
 *
 * Provides:
 * - `publishToDlq()` — sends a failed message to the appropriate DLQ Kafka topic
 * - `withRetry()` — wraps an async function with exponential-backoff retry;
 *   transient errors are retried, permanent errors go straight to DLQ
 */
@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  /** In-memory DLQ counters per topic (for health monitoring) */
  private readonly dlqCounts = new Map<string, number>();

  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  // ── Publish to DLQ ───────────────────────────────────────

  /**
   * Send a failed message to the dead-letter queue.
   */
  async publishToDlq(
    originalTopic: string,
    messageKey: string | undefined,
    messageValue: string | undefined,
    error: Error | unknown,
    metadata: { partition?: number; offset?: string; retryCount?: number } = {},
  ): Promise<void> {
    const dlqTopic = this.resolveDlqTopic(originalTopic);
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const errorStack =
      error instanceof Error ? error.stack : undefined;

    try {
      await this.kafkaProducer.produce(dlqTopic, {
        key: messageKey,
        value: messageValue ?? '',
        headers: {
          'x-original-topic': originalTopic,
          'x-error-message': errorMessage,
          ...(errorStack ? { 'x-error-stack': errorStack.substring(0, 1000) } : {}),
          'x-retry-count': String(metadata.retryCount ?? 0),
          'x-failed-at': new Date().toISOString(),
          ...(metadata.partition !== undefined
            ? { 'x-original-partition': String(metadata.partition) }
            : {}),
          ...(metadata.offset
            ? { 'x-original-offset': metadata.offset }
            : {}),
        },
      });

      // Increment counter
      this.dlqCounts.set(dlqTopic, (this.dlqCounts.get(dlqTopic) ?? 0) + 1);

      this.logger.warn(
        `Message sent to DLQ [${dlqTopic}] from ${originalTopic} ` +
          `(partition=${metadata.partition}, offset=${metadata.offset}): ${errorMessage}`,
      );
    } catch (dlqError) {
      // DLQ publish itself failed — log but don't throw (avoid infinite loop)
      this.logger.error(
        `CRITICAL: Failed to publish to DLQ topic ${dlqTopic}`,
        dlqError,
      );
    }
  }

  // ── Retry with exponential backoff ───────────────────────

  /**
   * Execute `fn` with retry. Returns `true` if the function succeeded
   * (possibly after retries) or `false` if all retries were exhausted.
   *
   * On exhaustion, the caller is responsible for sending to DLQ
   * (the consumer service does this after `withRetry` returns false).
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    policy: RetryPolicy = { maxRetries: 3, baseDelayMs: 100 },
  ): Promise<{ success: true; result: T } | { success: false; error: Error; retryCount: number }> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      try {
        const result = await fn();
        return { success: true, result };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Permanent error — no point retrying
        if (!isTransientError(err)) {
          this.logger.debug(
            `Permanent error detected (attempt ${attempt + 1}), skipping retries: ${lastError.message}`,
          );
          return { success: false, error: lastError, retryCount: attempt };
        }

        // Last attempt — don't sleep, just fail
        if (attempt === policy.maxRetries) {
          break;
        }

        // Exponential backoff: baseDelay * 2^attempt
        const delay = policy.baseDelayMs * Math.pow(2, attempt);
        this.logger.debug(
          `Retrying in ${delay}ms (attempt ${attempt + 1}/${policy.maxRetries}): ${lastError.message}`,
        );
        await this.sleep(delay);
      }
    }

    return { success: false, error: lastError, retryCount: policy.maxRetries };
  }

  // ── DLQ metrics ──────────────────────────────────────────

  /**
   * Get per-topic DLQ message counts (since service startup).
   */
  getDlqCounts(): Record<string, number> {
    return Object.fromEntries(this.dlqCounts);
  }

  /**
   * Get total DLQ messages since startup.
   */
  getTotalDlqCount(): number {
    let total = 0;
    for (const count of this.dlqCounts.values()) {
      total += count;
    }
    return total;
  }

  // ── Helpers ──────────────────────────────────────────────

  /**
   * Map an original topic to its DLQ topic.
   * CDC topics all go to `cdc.dlq`; others get `.dlq` appended.
   */
  private resolveDlqTopic(originalTopic: string): string {
    if (CDC_TOPICS.has(originalTopic)) {
      return CDC_DLQ_TOPIC;
    }
    return `${originalTopic}${DLQ_SUFFIX}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
