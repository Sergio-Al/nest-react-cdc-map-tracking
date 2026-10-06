export const PIPELINE_STAGES = [
  'api.received', 'kafka.produced', 'integration.consumed', 'integration.retry',
  'mysql.committed', 'dlq.sent', 'dlq.replayed', 'cdc.captured', 'pg.applied', 'ws.broadcast',
] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];
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
export type TraceInput = Pick<PipelineTrace, 'correlationId' | 'tenantId' | 'entity' | 'op' | 'mode'>;
export interface PipelineEvent extends Omit<TraceInput, 'mode'>, PipelineTraceStage {}
export interface CdcObservation {
  table: 'customers' | 'orders';
  id: number;
  tenantId: string;
  capturedAt: string;
  sourceTsMs: number | null;
  appliedAt: string;
  broadcastAt: string | null;
}

export function projectTrace(trace: PipelineTrace): PipelineTrace {
  const stages = [...trace.stages].sort((a, b) => a.at.localeCompare(b.at)
    || PIPELINE_STAGES.indexOf(a.stage) - PIPELINE_STAGES.indexOf(b.stage));
  let status: PipelineTrace['status'] = 'in_flight';
  let completedAt: string | null = null;
  for (const entry of stages) {
    if (entry.stage === 'dlq.sent') { status = 'failed'; completedAt = null; }
    if (entry.stage === 'dlq.replayed') { status = 'in_flight'; completedAt = null; }
    if (entry.stage === 'ws.broadcast') { status = 'completed'; completedAt = entry.at; }
  }
  const startedAt = stages[0]?.at ?? trace.startedAt;
  return { ...trace, stages, status, startedAt, completedAt,
    totalMs: completedAt ? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) : null };
}
