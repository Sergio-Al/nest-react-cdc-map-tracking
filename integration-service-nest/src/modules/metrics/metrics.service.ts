import { Injectable } from '@nestjs/common';

/**
 * Operational counters exposed via `GET /metrics`, matching the Go service's
 * `internal/health` Stats: per-topic processed counts, total DLQ sends, total
 * DB errors, and uptime.
 */
@Injectable()
export class MetricsService {
  private readonly processed = new Map<string, number>();
  private dlqSends = 0;
  private dbErrors = 0;
  private readonly startTime = Date.now();

  addProcessed(topic: string): void {
    this.processed.set(topic, (this.processed.get(topic) ?? 0) + 1);
  }

  addDlqSend(): void {
    this.dlqSends += 1;
  }

  addDbError(): void {
    this.dbErrors += 1;
  }

  /** Render the Prometheus-style text body, byte-for-byte compatible with the Go service. */
  renderPrometheus(): string {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const lines: string[] = [];
    lines.push('# integration-service metrics');
    lines.push(`uptime_seconds ${uptimeSeconds}`);
    for (const [topic, count] of this.processed) {
      lines.push(`messages_processed{topic="${topic}"} ${count}`);
    }
    lines.push(`dlq_sends_total ${this.dlqSends}`);
    lines.push(`db_errors_total ${this.dbErrors}`);
    return lines.join('\n') + '\n';
  }
}
