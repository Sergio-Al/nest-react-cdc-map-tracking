import { Injectable, Logger } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Dead-letter publisher. Mirrors the Go service's `sendToDLQ`: the original
 * key/value are forwarded verbatim to `<topic>.dlq` with two headers —
 * `dlq-reason` (human-readable failure cause) and `original-topic`.
 *
 * Never throws: a DLQ failure is logged but must not stall the consumer
 * (the command would otherwise be lost — we log it as CRITICAL instead).
 */
@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    private readonly producer: KafkaProducerService,
    private readonly metrics: MetricsService,
  ) {}

  async sendToDlq(
    originalTopic: string,
    key: Buffer | null,
    value: Buffer | null,
    reason: string,
  ): Promise<void> {
    const dlqTopic = `${originalTopic}.dlq`;
    try {
      await this.producer.produce(dlqTopic, {
        key,
        value,
        headers: {
          'dlq-reason': reason,
          'original-topic': originalTopic,
        },
      });
      this.metrics.addDlqSend();
      this.logger.warn(`message sent to DLQ [${dlqTopic}]: ${reason}`);
    } catch (error) {
      this.logger.error(
        `CRITICAL: failed to publish to DLQ topic ${dlqTopic} — command may be lost`,
        error,
      );
    }
  }
}
