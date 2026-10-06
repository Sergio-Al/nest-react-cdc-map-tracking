import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CachedCustomer } from '../../sync/entities/cached-customer.entity';
import { CustomerCacheService } from '../customer-cache.service';
import { TrackingGateway } from '../../websocket/tracking.gateway';
import { KafkaProducerService } from '../../kafka/kafka-producer.service';
import { StandaloneCustomerWriter } from './standalone-customer-writer';
import { IntegratedCustomerWriter } from './integrated-customer-writer';

describe('StandaloneCustomerWriter', () => {
  let writer: StandaloneCustomerWriter;
  let repo: { createQueryBuilder: jest.Mock; findOneByOrFail: jest.Mock; update: jest.Mock };
  let qb: any;
  let cache: { invalidate: jest.Mock };
  let gateway: { broadcastCdcChange: jest.Mock };
  const customer = { id: 1000000000, tenantId: 'tenant-1', name: 'New customer' } as CachedCustomer;

  beforeEach(() => {
    qb = {
      insert: jest.fn().mockReturnThis(), into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(), returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [{ id: '1000000000' }] }),
    };
    repo = {
      createQueryBuilder: jest.fn(() => qb),
      findOneByOrFail: jest.fn().mockResolvedValue(customer),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    cache = { invalidate: jest.fn().mockResolvedValue(undefined) };
    gateway = { broadcastCdcChange: jest.fn() };
    writer = new StandaloneCustomerWriter(
      repo as unknown as Repository<CachedCustomer>,
      cache as unknown as CustomerCacheService,
      gateway as unknown as TrackingGateway,
    );
  });

  it('omits id, returns the inserted row, invalidates cache and broadcasts to its tenant', async () => {
    const result = await writer.createCustomer('tenant-1', { tenantId: 'forged', name: 'New customer' });

    expect(result).toEqual({ mode: 'sync', customer });
    expect(qb.values).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', name: 'New customer', active: true,
      geofenceRadiusMeters: 100, customerType: 'regular', latitude: null,
    }));
    expect(qb.values.mock.calls[0][0]).not.toHaveProperty('id');
    expect(qb.returning).toHaveBeenCalledWith('id');
    expect(repo.findOneByOrFail).toHaveBeenCalledWith({ id: 1000000000, tenantId: 'tenant-1' });
    expect(cache.invalidate).toHaveBeenCalledWith(1000000000);
    expect(gateway.broadcastCdcChange).toHaveBeenCalledWith({
      table: 'customers', op: 'c', id: 1000000000, tenantId: 'tenant-1',
      sourceTsMs: null, appliedAt: expect.any(String), latencyMs: null,
    });
    expect(cache.invalidate.mock.invocationCallOrder[0]).toBeLessThan(
      gateway.broadcastCdcChange.mock.invocationCallOrder[0],
    );
  });

  it('updates only supplied fields, including zero coordinates, within the tenant', async () => {
    const result = await writer.updateCustomer('tenant-1', 1000000000, {
      tenantId: 'forged', latitude: 0, longitude: 0, geofenceRadiusMeters: 0,
    });

    expect(repo.update).toHaveBeenCalledWith({ id: 1000000000, tenantId: 'tenant-1' }, {
      latitude: 0, longitude: 0, geofenceRadiusMeters: 0, syncedAt: expect.any(Date),
    });
    expect(result).toEqual({ mode: 'sync', customer });
    expect(cache.invalidate).toHaveBeenCalledWith(1000000000);
    expect(gateway.broadcastCdcChange).toHaveBeenCalledWith(expect.objectContaining({ op: 'u' }));
  });

  it('returns a localized 404 for missing or cross-tenant updates without side effects', async () => {
    repo.update.mockResolvedValue({ affected: 0 });
    const error = await writer.updateCustomer('tenant-2', 1000000000, { tenantId: 'tenant-1', name: 'Changed' })
      .catch((err) => err);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toMatchObject({ errorCode: 'customers.notFound', args: { id: 1000000000 } });
    expect(repo.update.mock.calls[0][0]).toEqual({ id: 1000000000, tenantId: 'tenant-2' });
    expect(repo.findOneByOrFail).not.toHaveBeenCalled();
    expect(cache.invalidate).not.toHaveBeenCalled();
    expect(gateway.broadcastCdcChange).not.toHaveBeenCalled();
  });

  it('does not turn an applied insert into a failure when notifications are unavailable', async () => {
    cache.invalidate.mockRejectedValue(new Error('Redis down'));
    gateway.broadcastCdcChange.mockImplementation(() => { throw new Error('Socket down'); });
    await expect(writer.createCustomer('tenant-1', { tenantId: 'tenant-1', name: 'New customer' }))
      .resolves.toEqual({ mode: 'sync', customer });
    expect(gateway.broadcastCdcChange).toHaveBeenCalled();
  });
});

describe('IntegratedCustomerWriter', () => {
  let writer: IntegratedCustomerWriter;
  let producer: { produce: jest.Mock };

  beforeEach(() => {
    producer = { produce: jest.fn().mockResolvedValue(undefined) };
    writer = new IntegratedCustomerWriter(producer as unknown as KafkaProducerService);
  });

  it('preserves the exact create command contract and authoritative tenant', async () => {
    const dto = { tenantId: 'forged', name: 'Customer', latitude: -16.5, phone: '123' };
    const result = await writer.createCustomer('tenant-1', dto);
    expect(result).toEqual({ mode: 'async', correlationId: expect.any(String) });
    expect(producer.produce).toHaveBeenCalledWith('commands.customers', {
      key: 'tenant-1',
      value: JSON.stringify({ op: 'create', correlationId: (result as any).correlationId,
        data: { ...dto, tenantId: 'tenant-1' } }),
    });
  });

  it('preserves the exact update command contract including the target id', async () => {
    const dto = { tenantId: 'forged', longitude: 0 };
    const result = await writer.updateCustomer('tenant-1', 7, dto);
    expect(producer.produce).toHaveBeenCalledWith('commands.customers', {
      key: 'tenant-1',
      value: JSON.stringify({ op: 'update', correlationId: (result as any).correlationId,
        data: { ...dto, tenantId: 'tenant-1', id: 7 } }),
    });
  });

  it('propagates Kafka failures instead of acknowledging an unqueued write', async () => {
    producer.produce.mockRejectedValue(new Error('Kafka down'));
    await expect(writer.createCustomer('tenant-1', { tenantId: 'tenant-1', name: 'Customer' }))
      .rejects.toThrow('Kafka down');
  });
});
