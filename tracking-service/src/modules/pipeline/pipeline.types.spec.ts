import { projectTrace, PipelineTrace, PipelineTraceStage } from './pipeline.types';
const trace: PipelineTrace = { correlationId: 'c1', tenantId: 't1', entity: 'orders', op: 'create',
  mode: 'integrated', status: 'in_flight', startedAt: '2026-10-05T00:00:00.000Z',
  completedAt: null, totalMs: null, stages: [] };
const stage = (name: PipelineTraceStage['stage'], ms: number): PipelineTraceStage => ({
  stage: name, at: new Date(Date.parse(trace.startedAt) + ms).toISOString(),
});
it('marks DLQ failures and resets completion data on replay', () => {
  const failed = projectTrace({ ...trace, stages: [stage('api.received', 0), stage('dlq.sent', 10)] });
  expect(failed).toMatchObject({ status: 'failed', completedAt: null, totalMs: null });
  expect(projectTrace({ ...failed, stages: [...failed.stages, stage('dlq.replayed', 100)] }))
    .toMatchObject({ status: 'in_flight', completedAt: null, totalMs: null });
});
it('uses source chronology when an earlier Kafka ACK arrives after completion', () => {
  const result = projectTrace({ ...trace, stages: [stage('ws.broadcast', 500), stage('api.received', 0),
    stage('kafka.produced', 20), stage('mysql.committed', 400)] });
  expect(result).toMatchObject({ status: 'completed', totalMs: 500, completedAt: stage('ws.broadcast', 500).at });
  expect(result.stages.map((entry) => entry.stage)).toEqual(['api.received', 'kafka.produced', 'mysql.committed', 'ws.broadcast']);
});
it('measures full elapsed time across a failed attempt and successful replay', () => {
  const result = projectTrace({ ...trace, stages: [stage('api.received', 0), stage('dlq.sent', 100),
    stage('dlq.replayed', 3000), stage('ws.broadcast', 3500)] });
  expect(result.status).toBe('completed');
  expect(result.totalMs).toBe(3500);
});
