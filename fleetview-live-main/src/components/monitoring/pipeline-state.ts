import type { PipelineTrace } from '@/types/pipeline.types';

/** Stage arrays are append-only; an older HTTP snapshot must not roll back a socket update. */
export function mergeTraces(current: PipelineTrace[], incoming: PipelineTrace[]): PipelineTrace[] {
  const traces = new Map(current.map((trace) => [trace.correlationId, trace]));
  for (const trace of incoming) {
    const previous = traces.get(trace.correlationId);
    if (!previous || trace.stages.length >= previous.stages.length) traces.set(trace.correlationId, trace);
  }
  return [...traces.values()].sort((a, b) =>
    Date.parse(b.startedAt) - Date.parse(a.startedAt) || a.correlationId.localeCompare(b.correlationId),
  ).slice(0, 100);
}

export function selectTrace(traces: PipelineTrace[], pinnedId: string | null): PipelineTrace | undefined {
  return traces.find((trace) => trace.correlationId === pinnedId) ??
    traces.find((trace) => trace.status === 'in_flight') ?? traces[0];
}
