import { NotFoundException } from '@nestjs/common';
import { PipelineTraceService, SAVE_TRACE } from './pipeline-trace.service';
import { PipelineController } from './pipeline.controller';
import { PipelineConsumerService } from './pipeline-consumer.service';
import { RedisService } from '../redis/redis.service';
import { TrackingGateway } from '../websocket/tracking.gateway';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { PipelineTrace } from './pipeline.types';

const input = { correlationId: 'corr-1', tenantId: 'tenant-1', entity: 'customers' as const,
  op: 'create' as const, mode: 'integrated' as const };
const trace: PipelineTrace = { ...input, status: 'completed', startedAt: '2026-10-05T00:00:00.000Z',
  completedAt: '2026-10-05T00:00:00.250Z', totalMs: 250,
  stages: [{ stage: 'api.received', at: '2026-10-05T00:00:00.000Z' },
    { stage: 'ws.broadcast', at: '2026-10-05T00:00:00.250Z' }] };

describe('PipelineTraceService', () => {
  let service: PipelineTraceService;
  let client: { eval: jest.Mock; lrange: jest.Mock };
  let redis: { getClient: jest.Mock; getJson: jest.Mock; get: jest.Mock; del: jest.Mock };
  let gateway: { broadcastPipelineTrace: jest.Mock };

  beforeEach(() => {
    client = { eval: jest.fn().mockResolvedValue(JSON.stringify(trace)), lrange: jest.fn().mockResolvedValue(['corr-1']) };
    redis = { getClient: jest.fn(() => client), getJson: jest.fn().mockResolvedValue(trace),
      get: jest.fn().mockResolvedValue('corr-1'), del: jest.fn() };
    gateway = { broadcastPipelineTrace: jest.fn() };
    service = new PipelineTraceService(redis as unknown as RedisService, gateway as unknown as TrackingGateway);
  });

  it('starts the trace and bounded tenant index atomically with a 24-hour TTL', async () => {
    await service.start(input, '2026-10-05T00:00:00Z');
    const [script, keys, traceKey, listKey, initial, entry, ttl] = client.eval.mock.calls[0];
    expect(script).toBe(SAVE_TRACE);
    expect(keys).toBe(2);
    expect(traceKey).toBe('pipeline:trace:corr-1');
    expect(listKey).toBe('pipeline:traces:tenant-1');
    expect(JSON.parse(initial)).toMatchObject({ ...input, status: 'in_flight' });
    expect(JSON.parse(entry)).toEqual({ stage: 'api.received', at: '2026-10-05T00:00:00.000Z' });
    expect(ttl).toBe(86400);
    expect(gateway.broadcastPipelineTrace).toHaveBeenCalledWith(trace);
  });

  it('appends atomically and emits the full completed trace with its duration', async () => {
    await service.append('corr-1', 'ws.broadcast', undefined, '2026-10-05T00:00:00.250Z');
    expect(client.eval.mock.calls[0][0]).toBe(SAVE_TRACE);
    expect(JSON.parse(client.eval.mock.calls[0][5])).toEqual({ stage: 'ws.broadcast', at: trace.completedAt });
    expect(gateway.broadcastPipelineTrace).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', totalMs: 250 }));
  });

  it('never exposes a trace owned by another tenant', async () => {
    expect(await service.get('tenant-2', 'corr-1')).toBeNull();
    await expect(new PipelineController(service).get({ tenantId: 'tenant-2' }, 'corr-1')).rejects.toThrow(NotFoundException);
  });

  it('bounds list reads at 100 and filters expired or cross-tenant entries', async () => {
    client.lrange.mockResolvedValue(['corr-1', 'expired', 'foreign']);
    redis.getJson.mockResolvedValueOnce(trace).mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...trace, tenantId: 'tenant-2' });
    expect(await service.list('tenant-1', 200)).toEqual([trace]);
    expect(client.lrange).toHaveBeenCalledWith('pipeline:traces:tenant-1', 0, 99);
  });

  it('stores a ten-minute commit link even when the WebSocket broadcast fails', async () => {
    gateway.broadcastPipelineTrace.mockImplementation(() => { throw new Error('WS unavailable'); });
    client.eval.mockResolvedValueOnce(JSON.stringify(trace)).mockResolvedValueOnce(null);
    await expect(service.append('corr-1', 'mysql.committed', { table: 'customers', id: 7 })).resolves.toBeUndefined();
    expect(client.eval.mock.calls[1].slice(1)).toEqual([2, 'pipeline:link:customers:7', 'pipeline:pending:customers:7', 'corr-1', 600, trace.startedAt, 'tenant-1']);
  });

  it('reconciles CDC that arrived before the commit notification', async () => {
    const observation = { table: 'customers', id: 7, tenantId: 'tenant-1',
      sourceTsMs: 1, capturedAt: trace.startedAt, appliedAt: trace.completedAt,
      broadcastAt: trace.completedAt };
    client.eval.mockResolvedValueOnce(JSON.stringify(trace)).mockResolvedValueOnce(JSON.stringify(observation));
    const append = jest.spyOn(service, 'append');
    await service.append('corr-1', 'mysql.committed', { table: 'customers', id: 7 });
    expect(append.mock.calls.map(([, stage]) => stage)).toEqual([
      'mysql.committed', 'cdc.captured', 'pg.applied', 'ws.broadcast',
    ]);
  });

  it('retains an unmatched CDC observation for the commit/CDC race handoff', async () => {
    client.eval.mockResolvedValue(null);
    await service.finishCdc({ table: 'orders', id: 7, tenantId: 'tenant-1',
      capturedAt: trace.startedAt, sourceTsMs: null, appliedAt: trace.startedAt, broadcastAt: null }, null);
    expect(client.eval.mock.calls[0].slice(1, 4)).toEqual([2, 'pipeline:link:orders:7', 'pipeline:pending:orders:7']);
  });

  it('does not break writes or reads if Redis is unavailable', async () => {
    client.eval.mockRejectedValue(new Error('Redis down'));
    client.lrange.mockRejectedValue(new Error('Redis down'));
    redis.getJson.mockRejectedValue(new Error('Redis down'));
    await expect(service.start(input)).resolves.toBeUndefined();
    await expect(service.append('corr-1', 'pg.applied')).resolves.toBeUndefined();
    expect(await service.list('tenant-1')).toEqual([]);
    expect(await service.get('tenant-1', 'corr-1')).toBeNull();
  });
});

describe('PipelineConsumerService', () => {
  it('registers an optional topic and creates missing traces from valid integration events', async () => {
    const consumer = { registerHandler: jest.fn() };
    const traces = { start: jest.fn(), append: jest.fn() };
    new PipelineConsumerService(consumer as unknown as KafkaConsumerService, traces as unknown as PipelineTraceService).onModuleInit();
    const registration = consumer.registerHandler.mock.calls[0][0];
    expect(registration).toMatchObject({ topic: 'pipeline.traces', optional: true });
    const event = { ...input, stage: 'integration.consumed', at: trace.startedAt };
    await registration.handler({ message: { value: Buffer.from(JSON.stringify(event)) } });
    expect(traces.start).toHaveBeenCalledWith(expect.objectContaining(input), trace.startedAt, false);
    expect(traces.append).toHaveBeenCalledWith('corr-1', 'integration.consumed', undefined, trace.startedAt);
    await registration.handler({ message: { value: Buffer.from('{bad json') } });
    expect(traces.append).toHaveBeenCalledTimes(1);
  });
});
