import { PipelineEventsService } from './pipeline-events.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
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
  let producer: { produce: jest.Mock };
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
      insert: jest.fn().mockResolvedValue({ identifiers: [{ id: '123' }] }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    producer = { produce: jest.fn().mockResolvedValue(undefined) };
    consumer = { registerHandler: jest.fn() };
    dlq = { sendToDlq: jest.fn().mockResolvedValue(undefined) };
    metrics = { addDbError: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineEventsService,
        { provide: KafkaProducerService, useValue: producer },
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

  it('emits consumed and committed stages with the actual MySQL insert id', async () => {
    await run(payloadOf({ op: 'create', correlationId: 'trace-1',
      data: { tenantId: 'tenant-1', customerId: 10 } }));
    const events = producer.produce.mock.calls.map(([, message]) => JSON.parse(message.value));
    expect(events.map((event) => event.stage)).toEqual(['integration.consumed', 'mysql.committed']);
    expect(events[1]).toMatchObject({ correlationId: 'trace-1', tenantId: 'tenant-1', entity: 'orders',
      op: 'create', detail: { table: 'orders', id: '123' } });
    expect(producer.produce.mock.calls[0][0]).toBe('pipeline.traces');
    expect(producer.produce.mock.calls[0][1].key).toBe('trace-1');
  });

  it('emits every failed DB attempt and the final DLQ reason', async () => {
    repo.insert.mockRejectedValue(new Error('DB unavailable'));
    await run(payloadOf({ op: 'create', correlationId: 'trace-2',
      data: { tenantId: 'tenant-1', customerId: 10 } }));
    const events = producer.produce.mock.calls.map(([, message]) => JSON.parse(message.value));
    expect(events.filter((event) => event.stage === 'integration.retry').map((event) => event.detail.attempt))
      .toEqual([1, 2, 3, 4]);
    expect(events[events.length - 1]).toMatchObject({ stage: 'dlq.sent', detail: { reason: expect.stringContaining('DB unavailable') } });
  });

  it('does not fail the business write when pipeline event production fails', async () => {
    producer.produce.mockRejectedValue(new Error('Trace topic missing'));
    await run(payloadOf({ op: 'create', correlationId: 'trace-3',
      data: { tenantId: 'tenant-1', customerId: 10 } }));
    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(dlq.sendToDlq).not.toHaveBeenCalled();
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
