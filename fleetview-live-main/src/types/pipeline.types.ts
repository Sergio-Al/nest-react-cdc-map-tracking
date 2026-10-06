export type PipelineStage = 'api.received' | 'kafka.produced' | 'integration.consumed' |
  'integration.retry' | 'mysql.committed' | 'dlq.sent' | 'dlq.replayed' |
  'cdc.captured' | 'pg.applied' | 'ws.broadcast';

export interface PipelineTraceStage {
  stage: PipelineStage;
  at: string;
  detail?: Record<string, unknown>;
}

export interface PipelineTrace {
  correlationId: string;
  tenantId: string;
  entity: 'customers' | 'orders';
  op: 'create' | 'update' | 'status';
  mode: 'integrated' | 'standalone';
  status: 'in_flight' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  totalMs: number | null;
  stages: PipelineTraceStage[];
}

export interface DlqTopics {
  topics: { topic: string; messageCount: number; pendingCount: number }[];
  sessionCounts: Record<string, number>;
  totalSessionMessages: number;
}

export interface DlqMessages {
  topic: string;
  count: number;
  messages: { key?: string; value: string; headers: Record<string, string>; partition: number; offset: string; timestamp: string; replayed?: boolean }[];
}
