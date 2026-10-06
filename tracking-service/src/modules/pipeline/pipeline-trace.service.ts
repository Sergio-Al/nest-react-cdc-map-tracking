import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { TrackingGateway } from '../websocket/tracking.gateway';
import { PipelineTrace, PipelineStage, TraceInput, CdcObservation, projectTrace } from './pipeline.types';

const TTL = 24 * 60 * 60;
const LINK_TTL = 10 * 60;

// Redis serializes concurrent appenders across processes. Sorting by original
// timestamps handles events delivered late by a different Kafka partition.
export const SAVE_TRACE = `
local raw = redis.call('GET', KEYS[1])
local trace
if raw then trace = cjson.decode(raw)
elseif ARGV[1] ~= '' then
  trace = cjson.decode(ARGV[1])
  redis.call('LPUSH', KEYS[2], trace.correlationId)
  redis.call('LTRIM', KEYS[2], 0, 99)
else return nil end
redis.call('EXPIRE', 'pipeline:traces:' .. trace.tenantId, ARGV[3])
if ARGV[2] ~= '' then
  local entry = cjson.decode(ARGV[2])
  local duplicate = false
  for _, old in ipairs(trace.stages) do
    if old.stage == entry.stage and old.at == entry.at then duplicate = true end
  end
  if not duplicate then table.insert(trace.stages, entry) end
end
local ranks = {['api.received']=1,['kafka.produced']=2,['integration.consumed']=3,
 ['integration.retry']=4,['mysql.committed']=5,['dlq.sent']=6,['dlq.replayed']=7,
 ['cdc.captured']=8,['pg.applied']=9,['ws.broadcast']=10}
table.sort(trace.stages, function(a,b)
 if a.at == b.at then return ranks[a.stage] < ranks[b.stage] end
 return a.at < b.at
end)
trace.status = 'in_flight'
trace.completedAt = cjson.null
trace.totalMs = cjson.null
for _, entry in ipairs(trace.stages) do
 if entry.stage == 'dlq.sent' then trace.status = 'failed'; trace.completedAt = cjson.null
 elseif entry.stage == 'dlq.replayed' then trace.status = 'in_flight'; trace.completedAt = cjson.null
 elseif entry.stage == 'ws.broadcast' then trace.status = 'completed'; trace.completedAt = entry.at end
end
if #trace.stages > 0 then trace.startedAt = trace.stages[1].at end
local function epoch(iso)
 local y,m,d,h,mi,sec,ms = iso:match('(%d+)%-(%d+)%-(%d+)T(%d+):(%d+):(%d+)%.(%d+)Z')
 y=tonumber(y); m=tonumber(m); d=tonumber(d)
 local months = {0,31,59,90,120,151,181,212,243,273,304,334}
 local days = 365*(y-1970) + math.floor((y-1)/4)-492 - math.floor((y-1)/100)+19
   + math.floor((y-1)/400)-4 + months[m]+d-1
 if m > 2 and (y%400 == 0 or (y%4 == 0 and y%100 ~= 0)) then days=days+1 end
 return ((days*24+tonumber(h))*60+tonumber(mi))*60000 + tonumber(sec)*1000+tonumber(ms)
end
if trace.completedAt ~= cjson.null then
 trace.totalMs = math.max(0, epoch(trace.completedAt)-epoch(trace.startedAt))
end
local result = cjson.encode(trace)
redis.call('SET', KEYS[1], result, 'EX', ARGV[3])
return result
`;

// Commit notifications and CDC live on different topics. Atomically hand off
// early CDC observations so a fast Debezium update cannot lose its trace link.
const COMMIT_LINK = `
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
local pending = redis.call('GET', KEYS[2])
if pending then
 redis.call('DEL', KEYS[2])
 local event = cjson.decode(pending)
 if event.capturedAt >= ARGV[3] and event.tenantId == ARGV[4] then
   redis.call('DEL', KEYS[1]); return pending
 end
end
return nil
`;
const PENDING_CDC = `
local linked = redis.call('GET', KEYS[1])
if linked then return linked end
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
return nil
`;

@Injectable()
export class PipelineTraceService {
  private readonly logger = new Logger(PipelineTraceService.name);
  constructor(private readonly redis: RedisService, private readonly gateway: TrackingGateway) {}

  async start(input: TraceInput, at = new Date().toISOString(), received = true): Promise<void> {
    try {
      at = new Date(at).toISOString();
      const trace: PipelineTrace = { correlationId: input.correlationId, tenantId: input.tenantId,
        entity: input.entity, op: input.op, mode: input.mode, status: 'in_flight', startedAt: at,
        completedAt: null, totalMs: null, stages: [] };
      const raw = await this.redis.getClient().eval(SAVE_TRACE, 2,
        `pipeline:trace:${input.correlationId}`, `pipeline:traces:${input.tenantId}`,
        JSON.stringify(trace), received ? JSON.stringify({ stage: 'api.received', at }) : '', TTL);
      if (raw && received) await this.broadcast(raw as string);
    } catch (err) { this.warn(err); }
  }

  async append(correlationId: string, stage: PipelineStage,
    detail?: Record<string, unknown>, at = new Date().toISOString()): Promise<void> {
    try {
      at = new Date(at).toISOString();
      const raw = await this.redis.getClient().eval(SAVE_TRACE, 2,
        `pipeline:trace:${correlationId}`, '', '', JSON.stringify({ stage, at, detail }), TTL);
      if (!raw) return;
      await this.broadcast(raw as string);
      if (stage === 'mysql.committed' && detail?.table && detail.id != null) {
        const table = String(detail.table);
        const id = Number(detail.id);
        if (!['customers', 'orders'].includes(table) || !Number.isFinite(id)) return;
        const pending = await this.redis.getClient().eval(COMMIT_LINK, 2,
          `pipeline:link:${table}:${id}`, `pipeline:pending:${table}:${id}`, correlationId, LINK_TTL, JSON.parse(raw as string).startedAt, JSON.parse(raw as string).tenantId);
        if (pending) await this.applyCdc(correlationId, JSON.parse(pending as string));
      }
    } catch (err) { this.warn(err); }
  }

  private async broadcast(raw: string): Promise<void> {
    const trace = projectTrace(JSON.parse(raw));
    try { this.gateway.broadcastPipelineTrace(trace); } catch (err) { this.warn(err); }
  }

  async list(tenantId: string, limit = 20): Promise<PipelineTrace[]> {
    try {
      const ids = await this.redis.getClient().lrange(`pipeline:traces:${tenantId}`, 0, Math.min(100, Math.max(1, limit)) - 1);
      const traces = await Promise.all(ids.map((id) => this.get(tenantId, id)));
      return traces.filter((trace): trace is PipelineTrace => !!trace)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    } catch (err) { this.warn(err); return []; }
  }

  async get(tenantId: string, id: string): Promise<PipelineTrace | null> {
    try {
      const trace = await this.redis.getJson<PipelineTrace>(`pipeline:trace:${id}`);
      if (!trace || trace.tenantId !== tenantId) return null;
      return projectTrace(trace);
    } catch (err) { this.warn(err); return null; }
  }

  async lookupLink(table: string, id: number): Promise<string | null> {
    try { return await this.redis.get(`pipeline:link:${table}:${id}`); }
    catch (err) { this.warn(err); return null; }
  }

  async finishCdc(observation: CdcObservation, correlationId: string | null): Promise<void> {
    try {
      if (!correlationId) correlationId = await this.redis.getClient().eval(PENDING_CDC, 2,
        `pipeline:link:${observation.table}:${observation.id}`,
        `pipeline:pending:${observation.table}:${observation.id}`, JSON.stringify(observation), LINK_TTL) as string | null;
      if (!correlationId) return;
      await this.applyCdc(correlationId, observation);
      await this.redis.del(`pipeline:link:${observation.table}:${observation.id}`);
    } catch (err) { this.warn(err); }
  }

  private async applyCdc(id: string, observation: CdcObservation): Promise<void> {
    if (!await this.get(observation.tenantId, id)) return;
    await this.append(id, 'cdc.captured', { sourceTsMs: observation.sourceTsMs }, observation.capturedAt);
    await this.append(id, 'pg.applied', { table: observation.table, id: observation.id }, observation.appliedAt);
    if (observation.broadcastAt) await this.append(id, 'ws.broadcast', undefined, observation.broadcastAt);
  }

  private warn(err: unknown): void {
    this.logger.warn(`Pipeline tracing unavailable: ${(err as Error).message}`);
  }
}
