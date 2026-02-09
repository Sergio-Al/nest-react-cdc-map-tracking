import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Kafka, Admin, logLevel as KafkaLogLevel } from 'kafkajs';
import { TrackingGateway } from '../websocket/tracking.gateway';

export interface TableMetrics {
  table: string;
  topic: string;
  lastSourceTimestamp: number | null;
  lastKafkaTimestamp: number | null;
  lastProcessedAt: number | null;
  lastEndToEndLagMs: number | null;
  lastCaptureLagMs: number | null;
  lastConsumerLagMs: number | null;
  eventsProcessed: number;
  errorsCount: number;
  lastError: string | null;
  lastErrorAt: number | null;
  lastOp: string | null;
  lagHistory: Array<{ ts: number; lagMs: number }>;
}

export interface OffsetLag {
  topic: string;
  partition: number;
  latestOffset: string;
  committedOffset: string;
  lag: number;
}

export interface CdcLagSnapshot {
  timestamp: string;
  uptimeSeconds: number;
  tables: TableMetrics[];
  kafkaOffsetLag: OffsetLag[];
  totals: {
    totalEventsProcessed: number;
    totalErrors: number;
    maxLagMs: number;
    avgLagMs: number;
  };
}

@Injectable()
export class CdcMetricsService {
  private readonly logger = new Logger(CdcMetricsService.name);
  private readonly metricsMap = new Map<string, TableMetrics>();
  private readonly MAX_HISTORY = 60; // 5 minutes at 5-second intervals
  private readonly startTime = Date.now();
  private kafka: Kafka;
  private groupId: string;

  constructor(
    @Inject(forwardRef(() => TrackingGateway))
    private readonly trackingGateway: TrackingGateway,
    private readonly config: ConfigService,
  ) {
    // Reuse the same Kafka broker/config as the rest of the app
    const broker = this.config.get<string>('kafka.broker', 'localhost:9094');
    this.groupId = this.config.get<string>('kafka.groupId', 'tracking-service-group');

    this.kafka = new Kafka({
      clientId: 'cdc-metrics',
      brokers: [broker],
      retry: {
        initialRetryTime: 100,
        retries: 2,
      },
      connectionTimeout: 3000,
      requestTimeout: 5000,
      // Silence kafkajs internal retry/connection ERROR logs for this admin-only client
      logLevel: KafkaLogLevel.NOTHING,
    });

    this.logger.log(`Initialized CDC metrics (Kafka broker: ${broker})`);

    // Initialize default tables
    this.initializeTable('cdc.users', 'users_cache');
    this.initializeTable('cdc.accounts', 'accounts_cache');
    this.initializeTable('cdc.customers', 'customers_cache');
    this.initializeTable('cdc.products', 'products_cache');
  }

  private initializeTable(topic: string, table: string): void {
    this.metricsMap.set(topic, {
      table,
      topic,
      lastSourceTimestamp: null,
      lastKafkaTimestamp: null,
      lastProcessedAt: null,
      lastEndToEndLagMs: null,
      lastCaptureLagMs: null,
      lastConsumerLagMs: null,
      eventsProcessed: 0,
      errorsCount: 0,
      lastError: null,
      lastErrorAt: null,
      lastOp: null,
      lagHistory: [],
    });
  }

  /**
   * Record a successful CDC event processing
   */
  recordEvent(
    topic: string,
    sourceTimestamp: number | null,
    kafkaTimestamp: number | null,
    operation: string,
  ): void {
    let metrics = this.metricsMap.get(topic);
    if (!metrics) {
      // Auto-initialize if topic not seen before
      const tableName = topic.replace('cdc.', '') + '_cache';
      this.initializeTable(topic, tableName);
      metrics = this.metricsMap.get(topic)!;
    }

    const now = Date.now();
    metrics.lastSourceTimestamp = sourceTimestamp;
    metrics.lastKafkaTimestamp = kafkaTimestamp;
    metrics.lastProcessedAt = now;
    metrics.lastOp = operation;
    metrics.eventsProcessed++;

    // Calculate lag metrics
    if (sourceTimestamp) {
      metrics.lastEndToEndLagMs = now - sourceTimestamp;
      this.appendToHistory(metrics, metrics.lastEndToEndLagMs);
    }

    if (sourceTimestamp && kafkaTimestamp) {
      metrics.lastCaptureLagMs = kafkaTimestamp - sourceTimestamp;
    }

    if (kafkaTimestamp) {
      metrics.lastConsumerLagMs = now - kafkaTimestamp;
    }
  }

  /**
   * Record a CDC processing error
   */
  recordError(topic: string, error: string): void {
    let metrics = this.metricsMap.get(topic);
    if (!metrics) {
      const tableName = topic.replace('cdc.', '') + '_cache';
      this.initializeTable(topic, tableName);
      metrics = this.metricsMap.get(topic)!;
    }

    metrics.errorsCount++;
    metrics.lastError = error;
    metrics.lastErrorAt = Date.now();
  }

  /**
   * Append lag value to the ring buffer history
   */
  private appendToHistory(metrics: TableMetrics, lagMs: number): void {
    metrics.lagHistory.push({ ts: Date.now(), lagMs });
    if (metrics.lagHistory.length > this.MAX_HISTORY) {
      metrics.lagHistory.shift();
    }
  }

  /**
   * Get metrics for all tables
   */
  getTableMetrics(): TableMetrics[] {
    return Array.from(this.metricsMap.values());
  }

  /**
   * Get maximum lag across all tables (for health check)
   */
  getMaxLag(): number {
    const metrics = this.getTableMetrics();
    return Math.max(...metrics.map((m) => m.lastEndToEndLagMs ?? 0), 0);
  }

  /**
   * Get complete snapshot of CDC lag metrics
   */
  async getSnapshot(): Promise<CdcLagSnapshot> {
    const tables = this.getTableMetrics();
    const kafkaOffsetLag = await this.fetchKafkaOffsetLag();

    const totalEventsProcessed = tables.reduce(
      (sum, t) => sum + t.eventsProcessed,
      0,
    );
    const totalErrors = tables.reduce((sum, t) => sum + t.errorsCount, 0);
    const maxLagMs = Math.max(...tables.map((t) => t.lastEndToEndLagMs ?? 0), 0);
    const validLags = tables
      .map((t) => t.lastEndToEndLagMs)
      .filter((lag): lag is number => lag !== null);
    const avgLagMs =
      validLags.length > 0
        ? validLags.reduce((sum, lag) => sum + lag, 0) / validLags.length
        : 0;

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      tables,
      kafkaOffsetLag,
      totals: {
        totalEventsProcessed,
        totalErrors,
        maxLagMs,
        avgLagMs: Math.round(avgLagMs),
      },
    };
  }

  /**
   * Fetch Kafka offset lag using Admin client
   */
  private async fetchKafkaOffsetLag(): Promise<OffsetLag[]> {
    const admin: Admin = this.kafka.admin();
    const offsetLags: OffsetLag[] = [];

    try {
      // Set a connection timeout to avoid hanging
      await Promise.race([
        admin.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 3000),
        ),
      ]);

      const topics = Array.from(this.metricsMap.keys());

      for (const topic of topics) {
        try {
          // Fetch topic offsets (latest)
          const topicOffsets = await admin.fetchTopicOffsets(topic);

          // Fetch consumer group offsets
          const groupOffsets = await admin.fetchOffsets({
            groupId: this.groupId,
            topics: [topic],
          });

          // Calculate lag per partition
          for (const topicOffset of topicOffsets) {
            const groupOffset = groupOffsets.find(
              (g) =>
                g.topic === topic &&
                g.partitions.some(
                  (p) => p.partition === topicOffset.partition,
                ),
            );

            const committedOffset = groupOffset?.partitions.find(
              (p) => p.partition === topicOffset.partition,
            )?.offset;

            const latestOffset = topicOffset.offset;
            const committed = committedOffset || '0';
            const lag = Math.max(0, Number(latestOffset) - Number(committed));

            offsetLags.push({
              topic,
              partition: topicOffset.partition,
              latestOffset,
              committedOffset: committed,
              lag,
            });
          }
        } catch (error) {
          // Log at debug level to avoid spam
          this.logger.debug(
            `Failed to fetch offset lag for topic ${topic}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      // Only log connection errors at debug level to reduce log spam
      // Kafka offset lag is optional - the service works without it
      this.logger.debug(
        `Kafka admin connection unavailable: ${error.message}`,
      );
    } finally {
      try {
        await admin.disconnect();
      } catch (error) {
        // Ignore disconnect errors
      }
    }

    return offsetLags;
  }

  /**
   * Periodic broadcast of CDC lag to admin users via WebSocket
   * Runs every 5 seconds
   */
  @Cron('*/5 * * * * *')
  async broadcastLag(): Promise<void> {
    try {
      const snapshot = await this.getSnapshot();
      this.trackingGateway.broadcastCdcLag(snapshot);
      this.logger.debug(`Broadcast CDC lag snapshot to admin room`);
    } catch (error) {
      // Log at debug level to avoid spam - this is not critical
      this.logger.debug(
        `Failed to broadcast CDC lag: ${error.message}`,
      );
    }
  }
}
