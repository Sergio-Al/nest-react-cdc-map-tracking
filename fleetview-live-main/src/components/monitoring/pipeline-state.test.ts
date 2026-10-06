import { describe, expect, it } from 'vitest';
import { mergeTraces, selectTrace } from './pipeline-state';
import type { PipelineTrace } from '@/types/pipeline.types';

function trace(id: string, startedAt: string, status: PipelineTrace['status'] = 'in_flight'): PipelineTrace {
  return { correlationId: id, startedAt, status, tenantId: 'tenant-1', entity: 'customers', op: 'create', mode: 'integrated', completedAt: null, totalMs: null, stages: [{ stage: 'api.received', at: startedAt }] };
}

describe('pipeline trace state', () => {
  const older = trace('old', '2026-10-05T12:00:00Z');
  const newer = trace('new', '2026-10-05T12:01:00Z');
  it('upserts by correlation ID, sorts newest first, and ignores snapshots with fewer stages', () => {
    const updated = { ...older, stages: [...older.stages, { stage: 'kafka.produced' as const, at: '2026-10-05T12:00:01Z' }] };
    const merged = mergeTraces([older, newer], [updated]);
    expect(merged).toEqual([newer, updated]);
    expect(mergeTraces(merged, [older])).toEqual(merged);
  });
  it('follows the newest in-flight write while preserving a user pin', () => {
    const traces = mergeTraces([], [older, newer]);
    expect(selectTrace(traces, null)).toBe(newer);
    expect(selectTrace(traces, 'old')).toBe(older);
    expect(selectTrace([{ ...newer, status: 'completed' }, older], null)).toBe(older);
    expect(selectTrace(traces, 'missing')).toBe(newer);
    expect(selectTrace([], null)).toBeUndefined();
  });
  it('replaces failed traces with replay updates and caps the list at 100', () => {
    expect(mergeTraces([{ ...older, status: 'failed' }], [older])[0].status).toBe('in_flight');
    expect(mergeTraces([], Array.from({ length: 101 }, (_, i) => ({ ...older, correlationId: String(i) })))).toHaveLength(100);
  });
});
