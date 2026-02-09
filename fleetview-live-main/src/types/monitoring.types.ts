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
