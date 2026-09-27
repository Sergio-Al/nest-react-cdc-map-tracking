import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EachMessagePayload } from 'kafkajs';
import { OrdersHandler } from './orders.handler';
import { OrderEntity } from './entities/order.entity';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { DlqService } from '../kafka/dlq.service';
import { MetricsService } from '../metrics/metrics.service';

const TOPIC = 'commands.orders';

function payloadOf(value: unknown, key = 'tenant-1'): EachMessagePayload {
  return {
    topic: TOPIC,
    partition: 0,
    message: {
      key: Buffer.from(key),
      value:
        value === null
          ? null
          : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
      offset: '1',
    },
  } as unknown as EachMessagePayload;
}

describe('OrdersHandler', () => {
  let handler: (payload: EachMessagePayload) => Promise<void>;
  let repo: { insert: jest.Mock; update: jest.Mock };
  let consumer: { registerHandler: jest.Mock };
  let dlq: { sendToDlq: jest.Mock };
  let metrics: { addDbError: jest.Mock };

  /** Run the handler, draining any retry-backoff sleeps via fake timers. */
  async function run(payload: EachMessagePayload): Promise<void> {
    const done = handler(payload);
    await jest.runAllTimersAsync();
    return done;
  }

  beforeEach(async () => {
    jest.useFakeTimers();

    repo = {
      insert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    consumer = { registerHandler: jest.fn() };
    dlq = { sendToDlq: jest.fn().mockResolvedValue(undefined) };
    metrics = { addDbError: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersHandler,
        { provide: getRepositoryToken(OrderEntity), useValue: repo },
        { provide: KafkaConsumerService, useValue: consumer },
        { provide: DlqService, useValue: dlq },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();

    module.get(OrdersHandler).onModuleInit();
    handler = (payload) => consumer.registerHandler.mock.calls[0][0].handler(payload);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers on commands.orders', () => {
    expect(consumer.registerHandler).toHaveBeenCalledWith(
      expect.objectContaining({ topic: TOPIC }),
    );
  });

  // ── op:'status' (visit-completion write-back) ────────────

  describe('op status', () => {
    const statusCmd = {
      op: 'status',
      correlationId: 'corr-1',
      data: { tenantId: 'tenant-1', orderId: 555, status: 'completed' },
    };

    it('updates the order status in MySQL, tenant-scoped', async () => {
      await run(payloadOf(statusCmd));

      expect(repo.update).toHaveBeenCalledWith(
        { id: '555', tenantId: 'tenant-1' },
        { status: 'completed' },
      );
      expect(dlq.sendToDlq).not.toHaveBeenCalled();
    });

    it('DLQs a status command missing required fields, without retrying', async () => {
      await run(payloadOf({ ...statusCmd, data: { tenantId: 'tenant-1' } }));

      expect(repo.update).not.toHaveBeenCalled();
      expect(dlq.sendToDlq).toHaveBeenCalledWith(
        TOPIC,
        expect.anything(),
        expect.anything(),
        expect.stringContaining('required'),
      );
    });

    it('DLQs when the target order does not exist (permanent, single attempt)', async () => {
      repo.update.mockResolvedValue({ affected: 0 });

      await run(payloadOf(statusCmd));

      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(dlq.sendToDlq).toHaveBeenCalledWith(
        TOPIC,
        expect.anything(),
        expect.anything(),
        expect.stringContaining('order not found'),
      );
    });
  });

  // ── op:'create' ──────────────────────────────────────────

  describe('op create', () => {
    it('inserts with defaults and the supplied order number', async () => {
      await run(
        payloadOf({
          op: 'create',
          correlationId: 'corr-2',
          data: { tenantId: 'tenant-1', customerId: 10, orderNumber: 'ORD-000123' },
        }),
      );

      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          customerId: '10',
          orderNumber: 'ORD-000123',
          status: 'pending',
          totalAmount: 0,
          correlationId: 'corr-2',
        }),
      );
    });

    it('derives a deterministic order number from the correlationId when none is supplied', async () => {
      await run(
        payloadOf({
          op: 'create',
          correlationId: 'abcdef123456-rest-ignored',
          data: { tenantId: 'tenant-1', customerId: 10 },
        }),
      );

      // Deterministic across redeliveries — never a fresh Date.now() per delivery
      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ orderNumber: 'ORD-abcdef123456' }),
      );
    });

    it('treats a duplicate correlation_id as already-applied success', async () => {
      const dup: any = new Error('dup');
      dup.driverError = { errno: 1062 };
      repo.insert.mockRejectedValue(dup);

      await run(
        payloadOf({
          op: 'create',
          correlationId: 'corr-2',
          data: { tenantId: 'tenant-1', customerId: 10 },
        }),
      );

      expect(repo.insert).toHaveBeenCalledTimes(1);
      expect(dlq.sendToDlq).not.toHaveBeenCalled();
    });

    it('DLQs a create without a customerId', async () => {
      await run(
        payloadOf({ op: 'create', correlationId: 'corr-2', data: { tenantId: 'tenant-1' } }),
      );

      expect(repo.insert).not.toHaveBeenCalled();
      expect(dlq.sendToDlq).toHaveBeenCalled();
    });
  });

  // ── op:'update' ──────────────────────────────────────────

  describe('op update', () => {
    it('updates only the fields present in the command', async () => {
      await run(
        payloadOf({
          op: 'update',
          correlationId: 'corr-3',
          data: { tenantId: 'tenant-1', id: 7, status: 'confirmed' },
        }),
      );

      const [criteria, fields] = repo.update.mock.calls[0];
      expect(criteria).toEqual({ id: '7', tenantId: 'tenant-1' });
      expect(fields).toEqual({ status: 'confirmed' });
    });

    it('DLQs an update for a missing order without retrying', async () => {
      repo.update.mockResolvedValue({ affected: 0 });

      await run(
        payloadOf({ op: 'update', correlationId: 'corr-3', data: { tenantId: 'tenant-1', id: 7 } }),
      );

      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(dlq.sendToDlq).toHaveBeenCalledWith(
        TOPIC,
        expect.anything(),
        expect.anything(),
        expect.stringContaining('order not found'),
      );
    });
  });

  // ── Envelope + retry semantics ───────────────────────────

  describe('envelope and retries', () => {
    it('DLQs invalid JSON', async () => {
      await run(payloadOf('{broken'));

      expect(dlq.sendToDlq).toHaveBeenCalledWith(
        TOPIC,
        expect.anything(),
        expect.anything(),
        expect.stringContaining('invalid JSON'),
      );
    });

    it('DLQs an unhandled op', async () => {
      await run(payloadOf({ op: 'delete', correlationId: 'c', data: {} }));

      expect(dlq.sendToDlq).toHaveBeenCalledWith(
        TOPIC,
        expect.anything(),
        expect.anything(),
        'unhandled op: delete',
      );
    });

    it('retries transient DB errors and DLQs only after exhausting them', async () => {
      repo.insert.mockRejectedValue(new Error('mysql gone away'));

      await run(
        payloadOf({
          op: 'create',
          correlationId: 'corr-2',
          data: { tenantId: 'tenant-1', customerId: 10 },
        }),
      );

      expect(repo.insert).toHaveBeenCalledTimes(4); // initial + 3 retries
      expect(metrics.addDbError).toHaveBeenCalledTimes(4);
      expect(dlq.sendToDlq).toHaveBeenCalledWith(
        TOPIC,
        expect.anything(),
        expect.anything(),
        expect.stringContaining('DB error after retries'),
      );
    });
  });
});
