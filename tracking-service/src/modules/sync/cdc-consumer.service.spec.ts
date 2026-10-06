import { PipelineTraceService } from '../pipeline/pipeline-trace.service';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EachMessagePayload } from 'kafkajs';
import { CdcConsumerService } from './cdc-consumer.service';
import { CdcMetricsService } from './cdc-metrics.service';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { CustomerCacheService } from '../customers/customer-cache.service';
import { TrackingGateway } from '../websocket/tracking.gateway';
import { CachedAccount, CachedCustomer, CachedProduct, CachedOrder, SyncState } from './entities';

const repo = () => ({ upsert: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined) });

describe('CdcConsumerService', () => {
  let handlers: Record<string, (payload: EachMessagePayload) => Promise<void>>;
  let customerRepo: ReturnType<typeof repo>;
  let orderRepo: ReturnType<typeof repo>;
  let customerCache: { invalidate: jest.Mock };
  let traces: { lookupLink: jest.Mock; finishCdc: jest.Mock };
  let gateway: { broadcastCdcChange: jest.Mock };

  const message = (row: Record<string, unknown>): EachMessagePayload =>
    ({
      message: { value: Buffer.from(JSON.stringify(row)), offset: '42', timestamp: String(Date.now()) },
    }) as unknown as EachMessagePayload;

  beforeEach(async () => {
    customerRepo = repo();
    orderRepo = repo();
    customerCache = { invalidate: jest.fn().mockResolvedValue(undefined) };
    traces = { lookupLink: jest.fn().mockResolvedValue('corr-1'), finishCdc: jest.fn() };
    gateway = { broadcastCdcChange: jest.fn() };
    const kafkaConsumer = { registerHandler: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CdcConsumerService,
        { provide: PipelineTraceService, useValue: traces },
        { provide: KafkaConsumerService, useValue: kafkaConsumer },
        { provide: CdcMetricsService, useValue: { recordEvent: jest.fn() } },
        { provide: CustomerCacheService, useValue: customerCache },
        { provide: TrackingGateway, useValue: gateway },
        { provide: getRepositoryToken(CachedAccount, 'cacheDb'), useValue: repo() },
        { provide: getRepositoryToken(CachedCustomer, 'cacheDb'), useValue: customerRepo },
        { provide: getRepositoryToken(CachedProduct, 'cacheDb'), useValue: repo() },
        { provide: getRepositoryToken(CachedOrder, 'cacheDb'), useValue: orderRepo },
        { provide: getRepositoryToken(SyncState, 'cacheDb'), useValue: repo() },
      ],
    }).compile();

    module.get(CdcConsumerService).onModuleInit();
    handlers = Object.fromEntries(
      kafkaConsumer.registerHandler.mock.calls.map(([h]) => [h.topic, h.handler]),
    );
  });

  const customer = { id: 1005, tenant_id: 'tenant-1', name: 'Gustu', latitude: -16.53, longitude: -68.08, active: 1 };

  it('upserts a customer change, invalidates its cache entry and notifies the tenant', async () => {
    const committed = Date.now() - 800;
    await handlers['cdc.customers'](message({ ...customer, __op: 'u', __source_ts_ms: committed }));

    expect(customerRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 1005, name: 'Gustu' }), ['id']);
    expect(customerCache.invalidate).toHaveBeenCalledWith(1005);
    expect(traces.lookupLink).toHaveBeenCalledWith('customers', 1005);
    expect(traces.finishCdc).toHaveBeenCalledWith(expect.objectContaining({ table: 'customers', id: 1005, tenantId: 'tenant-1', broadcastAt: expect.any(String) }), 'corr-1');
    expect(gateway.broadcastCdcChange).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'customers', op: 'u', id: 1005, tenantId: 'tenant-1', sourceTsMs: committed }),
    );
    expect(gateway.broadcastCdcChange.mock.calls[0][0].latencyMs).toBeGreaterThanOrEqual(800);
  });

  it('handles deletes: removes the row, invalidates and broadcasts op d', async () => {
    await handlers['cdc.customers'](message({ ...customer, __op: 'd', __deleted: 'true' }));

    expect(customerRepo.delete).toHaveBeenCalledWith({ id: 1005 });
    expect(customerCache.invalidate).toHaveBeenCalledWith(1005);
    expect(gateway.broadcastCdcChange).toHaveBeenCalledWith(expect.objectContaining({ op: 'd', id: 1005 }));
  });

  it('does not broadcast snapshot reads (startup flood) but still invalidates', async () => {
    await handlers['cdc.customers'](message({ ...customer, __op: 'r' }));

    expect(customerCache.invalidate).toHaveBeenCalledWith(1005);
    expect(gateway.broadcastCdcChange).not.toHaveBeenCalled();
    expect(traces.lookupLink).not.toHaveBeenCalled();
  });

  it('broadcasts order changes without touching the customer cache', async () => {
    await handlers['cdc.orders'](
      message({ id: 77, tenant_id: 'tenant-1', customer_id: 1005, order_number: 'ERP-1', status: 'pending', __op: 'c' }),
    );

    expect(orderRepo.upsert).toHaveBeenCalled();
    expect(customerCache.invalidate).not.toHaveBeenCalled();
    expect(gateway.broadcastCdcChange).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'orders', op: 'c', id: 77, tenantId: 'tenant-1' }),
    );
  });

  it('never fails an applied change because invalidation or broadcast failed', async () => {
    customerCache.invalidate.mockRejectedValue(new Error('redis down'));
    gateway.broadcastCdcChange.mockImplementation(() => {
      throw new Error('socket down');
    });

    await expect(handlers['cdc.customers'](message({ ...customer, __op: 'u' }))).resolves.toBeUndefined();
    expect(customerRepo.upsert).toHaveBeenCalled();
  });
});
