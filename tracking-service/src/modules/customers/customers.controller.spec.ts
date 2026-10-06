import { Response } from 'express';
import { CustomersController } from './customers.controller';
import { CustomerWriterResolver } from './customer-writer.resolver';
import { CustomerCacheService } from './customer-cache.service';

describe('CustomersController', () => {
  const customer = { id: 1000000000, tenantId: 'tenant-1', name: 'Customer' };
  let controller: CustomersController;
  let writer: { createCustomer: jest.Mock; updateCustomer: jest.Mock };
  let resolver: { resolve: jest.Mock };
  let response: { status: jest.Mock; setHeader: jest.Mock };

  beforeEach(() => {
    writer = { createCustomer: jest.fn(), updateCustomer: jest.fn() };
    resolver = { resolve: jest.fn().mockResolvedValue(writer) };
    response = { status: jest.fn().mockReturnThis(), setHeader: jest.fn() };
    controller = new CustomersController({} as CustomerCacheService, resolver as unknown as CustomerWriterResolver);
  });

  it.each([
    ['sync', 201], ['async', 202],
  ] as const)('create returns the %s result with HTTP %i and uses the JWT tenant', async (mode, status) => {
    writer.createCustomer.mockResolvedValue(mode === 'sync'
      ? { mode, customer, correlationId: 'sync-correlation' } : { mode, correlationId: 'correlation-1' });
    const dto = { tenantId: 'forged', name: 'Customer' };
    const body = await controller.create(dto, { tenantId: 'tenant-1' }, response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.setHeader).toHaveBeenCalledWith('X-Correlation-Id', mode === 'sync' ? 'sync-correlation' : 'correlation-1');
    expect(body).toEqual(mode === 'sync' ? customer : { status: 'accepted', correlationId: 'correlation-1' });
    expect(resolver.resolve).toHaveBeenCalledWith('tenant-1');
    expect(writer.createCustomer).toHaveBeenCalledWith('tenant-1', { ...dto, tenantId: 'tenant-1' });
  });

  it.each([
    ['sync', 200], ['async', 202],
  ] as const)('update returns the %s result with HTTP %i', async (mode, status) => {
    writer.updateCustomer.mockResolvedValue(mode === 'sync'
      ? { mode, customer, correlationId: 'sync-correlation' } : { mode, correlationId: 'correlation-2' });
    const dto = { tenantId: 'forged', name: 'Changed' };
    const body = await controller.update('1000000000', dto, { tenantId: 'tenant-1' }, response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.setHeader).toHaveBeenCalledWith('X-Correlation-Id', mode === 'sync' ? 'sync-correlation' : 'correlation-2');
    expect(body).toEqual(mode === 'sync' ? customer : { status: 'accepted', correlationId: 'correlation-2' });
    expect(writer.updateCustomer).toHaveBeenCalledWith('tenant-1', 1000000000, { ...dto, tenantId: 'tenant-1' });
  });
});
