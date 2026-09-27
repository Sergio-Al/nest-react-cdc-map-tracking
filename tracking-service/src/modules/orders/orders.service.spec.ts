import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderWriterResolver } from './order-writer.resolver';
import { CachedOrder } from '../sync/entities/cached-order.entity';
import { SettingsService } from '../settings/settings.service';
import { StandaloneOrderWriter } from './writers/standalone-order-writer';
import { IntegratedOrderWriter } from './writers/integrated-order-writer';

describe('OrdersService', () => {
  let service: OrdersService;
  let repo: { find: jest.Mock; findOne: jest.Mock };
  let resolver: { resolve: jest.Mock };
  let writer: { createOrder: jest.Mock; updateOrder: jest.Mock; setOrderStatus: jest.Mock };

  function resolveAs(ingestMode: 'standalone' | 'integrated', allowAppOrderCreate: boolean) {
    resolver.resolve.mockResolvedValue({ writer, ingestMode, allowAppOrderCreate });
  }

  beforeEach(async () => {
    repo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };
    writer = {
      createOrder: jest.fn().mockResolvedValue({ mode: 'sync', order: { id: 1 } }),
      updateOrder: jest.fn().mockResolvedValue({ mode: 'sync', order: { id: 1 } }),
      setOrderStatus: jest.fn().mockResolvedValue(undefined),
    };
    resolver = { resolve: jest.fn() };
    resolveAs('standalone', true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(CachedOrder, 'cacheDb'), useValue: repo },
        { provide: OrderWriterResolver, useValue: resolver },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  describe('reads (mode-agnostic)', () => {
    it('lists tenant orders newest first from the cache', async () => {
      await service.getAllByTenant('tenant-1');

      expect(repo.find).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        order: { createdAt: 'DESC' },
      });
    });

    it('404s on a missing or cross-tenant order', async () => {
      await expect(service.findById('tenant-1', 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create/update gating by tenant mode', () => {
    const dto = { customerId: 10 } as any;

    it('delegates create to the resolved writer in standalone mode', async () => {
      const result = await service.create('tenant-1', dto);

      expect(writer.createOrder).toHaveBeenCalledWith('tenant-1', dto);
      expect(result).toEqual({ mode: 'sync', order: { id: 1 } });
    });

    it('blocks app-side create for integrated tenants that disallow it', async () => {
      resolveAs('integrated', false);

      await expect(service.create('tenant-1', dto)).rejects.toThrow(ForbiddenException);
      expect(writer.createOrder).not.toHaveBeenCalled();
    });

    it('allows app-side create for integrated tenants that opted in', async () => {
      resolveAs('integrated', true);

      await service.create('tenant-1', dto);

      expect(writer.createOrder).toHaveBeenCalled();
    });

    it('applies the same gate to updates', async () => {
      resolveAs('integrated', false);

      await expect(service.update('tenant-1', 1, dto)).rejects.toThrow(ForbiddenException);
      expect(writer.updateOrder).not.toHaveBeenCalled();
    });
  });

  describe('setOrderStatus (visit completion write-back)', () => {
    it('is never gated — status write-back works even when app creates are disabled', async () => {
      resolveAs('integrated', false);

      await service.setOrderStatus('tenant-1', 555, 'completed', { visitId: 'visit-1' });

      expect(writer.setOrderStatus).toHaveBeenCalledWith('tenant-1', 555, 'completed', {
        visitId: 'visit-1',
      });
    });
  });
});

// ── OrderWriterResolver ────────────────────────────────────

describe('OrderWriterResolver', () => {
  let resolver: OrderWriterResolver;
  let settings: { getOrderMode: jest.Mock };
  const standalone = { name: 'standalone' } as unknown as StandaloneOrderWriter;
  const integrated = { name: 'integrated' } as unknown as IntegratedOrderWriter;

  beforeEach(async () => {
    settings = { getOrderMode: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderWriterResolver,
        { provide: SettingsService, useValue: settings },
        { provide: StandaloneOrderWriter, useValue: standalone },
        { provide: IntegratedOrderWriter, useValue: integrated },
      ],
    }).compile();

    resolver = module.get(OrderWriterResolver);
  });

  it('picks the standalone writer for standalone tenants', async () => {
    settings.getOrderMode.mockResolvedValue({ ingestMode: 'standalone', allowAppOrderCreate: true });

    const resolved = await resolver.resolve('tenant-1');

    expect(resolved.writer).toBe(standalone);
    expect(resolved.ingestMode).toBe('standalone');
  });

  it('picks the integrated writer for integrated tenants and carries the create flag', async () => {
    settings.getOrderMode.mockResolvedValue({ ingestMode: 'integrated', allowAppOrderCreate: false });

    const resolved = await resolver.resolve('tenant-2');

    expect(resolved.writer).toBe(integrated);
    expect(resolved.allowAppOrderCreate).toBe(false);
  });
});
