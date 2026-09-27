import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { StandaloneOrderWriter } from './standalone-order-writer';
import { IntegratedOrderWriter } from './integrated-order-writer';
import { CachedOrder } from '../../sync/entities/cached-order.entity';
import { KafkaProducerService } from '../../kafka/kafka-producer.service';

// ── StandaloneOrderWriter (PG-owned, synchronous) ──────────

describe('StandaloneOrderWriter', () => {
  let writer: StandaloneOrderWriter;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOneByOrFail: jest.Mock;
    update: jest.Mock;
    query: jest.Mock;
  };
  let insertQB: any;

  beforeEach(async () => {
    insertQB = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [{ id: 7 }] }),
    };
    repo = {
      createQueryBuilder: jest.fn(() => insertQB),
      findOneByOrFail: jest.fn().mockResolvedValue({ id: 7, tenantId: 'tenant-1' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest.fn().mockResolvedValue([{ n: '42' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StandaloneOrderWriter,
        { provide: getRepositoryToken(CachedOrder, 'cacheDb'), useValue: repo },
      ],
    }).compile();

    writer = module.get(StandaloneOrderWriter);
  });

  describe('createOrder', () => {
    it('inserts synchronously and returns the created row (mode sync)', async () => {
      const result = await writer.createOrder('tenant-1', {
        customerId: 10,
        orderNumber: 'ORD-000001',
      } as any);

      expect(insertQB.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          customerId: 10,
          orderNumber: 'ORD-000001',
          status: 'pending', // default
        }),
      );
      expect(result).toEqual({ mode: 'sync', order: { id: 7, tenantId: 'tenant-1' } });
    });

    it('mints the next ORD-###### number from the sequence when none is supplied', async () => {
      await writer.createOrder('tenant-1', { customerId: 10 } as any);

      expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('orders_number_seq'));
      expect(insertQB.values).toHaveBeenCalledWith(
        expect.objectContaining({ orderNumber: 'ORD-000042' }),
      );
    });
  });

  describe('updateOrder', () => {
    it('updates only the fields present in the dto, tenant-scoped', async () => {
      await writer.updateOrder('tenant-1', 7, { status: 'confirmed' } as any);

      const [criteria, fields] = repo.update.mock.calls[0];
      expect(criteria).toEqual({ id: 7, tenantId: 'tenant-1' });
      expect(fields.status).toBe('confirmed');
      expect(fields).not.toHaveProperty('customerId');
      expect(fields).not.toHaveProperty('notes');
    });

    it('404s when no row matches (missing or cross-tenant)', async () => {
      repo.update.mockResolvedValue({ affected: 0 });

      await expect(writer.updateOrder('tenant-1', 99, {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setOrderStatus', () => {
    it('updates the status in place', async () => {
      await writer.setOrderStatus('tenant-1', 7, 'completed');

      expect(repo.update).toHaveBeenCalledWith(
        { id: 7, tenantId: 'tenant-1' },
        expect.objectContaining({ status: 'completed' }),
      );
    });

    it('does not throw for a missing order (logged and skipped)', async () => {
      repo.update.mockResolvedValue({ affected: 0 });

      await expect(writer.setOrderStatus('tenant-1', 99, 'completed')).resolves.toBeUndefined();
    });
  });
});

// ── IntegratedOrderWriter (Kafka commands, async) ──────────

describe('IntegratedOrderWriter', () => {
  let writer: IntegratedOrderWriter;
  let producer: { produce: jest.Mock };

  /** Parse the command envelope published on commands.orders. */
  function publishedCommand(): { topic: string; key: string; body: any } {
    const [topic, message] = producer.produce.mock.calls[0];
    return { topic, key: message.key, body: JSON.parse(message.value) };
  }

  beforeEach(async () => {
    producer = { produce: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegratedOrderWriter,
        { provide: KafkaProducerService, useValue: producer },
      ],
    }).compile();

    writer = module.get(IntegratedOrderWriter);
  });

  it('createOrder emits an async create command and returns its correlationId', async () => {
    const result = await writer.createOrder('tenant-1', { customerId: 10 } as any);

    const { topic, key, body } = publishedCommand();
    expect(topic).toBe('commands.orders');
    expect(key).toBe('tenant-1');
    expect(body.op).toBe('create');
    expect(body.data).toMatchObject({ tenantId: 'tenant-1', customerId: 10 });
    expect(result).toEqual({ mode: 'async', correlationId: body.correlationId });
  });

  it('updateOrder includes the target id in the command payload', async () => {
    await writer.updateOrder('tenant-1', 7, { status: 'confirmed' } as any);

    const { body } = publishedCommand();
    expect(body.op).toBe('update');
    expect(body.data).toMatchObject({ id: 7, tenantId: 'tenant-1', status: 'confirmed' });
  });

  it('setOrderStatus emits the narrow status-only command with completion metadata', async () => {
    await writer.setOrderStatus('tenant-1', 555, 'completed', {
      driverId: 'drv-1',
      visitId: 'visit-1',
    });

    const { body } = publishedCommand();
    expect(body.op).toBe('status');
    expect(body.data).toMatchObject({
      tenantId: 'tenant-1',
      orderId: 555,
      status: 'completed',
      driverId: 'drv-1',
      visitId: 'visit-1',
      completedAt: null, // defaults to null when not supplied
    });
  });
});
