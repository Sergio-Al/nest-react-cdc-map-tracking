import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EachMessagePayload } from 'kafkajs';
import { CustomersHandler } from './customers.handler';
import { CustomerEntity } from './entities/customer.entity';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { DlqService } from '../kafka/dlq.service';
import { MetricsService } from '../metrics/metrics.service';

const TOPIC = 'commands.customers';

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

function createCmd(data: Record<string, unknown>, correlationId = 'corr-1') {
  return { op: 'create', correlationId, data };
}

describe('CustomersHandler', () => {
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
        CustomersHandler,
        { provide: getRepositoryToken(CustomerEntity), useValue: repo },
        { provide: KafkaConsumerService, useValue: consumer },
        { provide: DlqService, useValue: dlq },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();

    module.get(CustomersHandler).onModuleInit();
    handler = (payload) => consumer.registerHandler.mock.calls[0][0].handler(payload);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers on commands.customers', () => {
    expect(consumer.registerHandler).toHaveBeenCalledWith(
      expect.objectContaining({ topic: TOPIC }),
    );
  });

  // ── Permanent failures → DLQ, no retry ───────────────────

  describe('permanent failures', () => {
    it('DLQs invalid JSON without touching the database', async () => {
      await run(payloadOf('{not json'));

      expect(dlq.sendToDlq).toHaveBeenCalledWith(
        TOPIC,
        expect.anything(),
        expect.anything(),
        expect.stringContaining('invalid JSON'),
      );
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('DLQs an unhandled op', async () => {
      await run(payloadOf({ op: 'delete', correlationId: 'c1', data: {} }));

      expect(dlq.sendToDlq).toHaveBeenCalledWith(
        TOPIC,
        expect.anything(),
        expect.anything(),
        'unhandled op: delete',
      );
    });

    it('DLQs a create with no tenantId', async () => {
      await run(payloadOf(createCmd({ name: 'Tienda' })));

      expect(dlq.sendToDlq).toHaveBeenCalledWith(
        TOPIC,
        expect.anything(),
        expect.anything(),
        expect.stringContaining('tenantId is required'),
      );
    });

    it('DLQs a create with no name', async () => {
      await run(payloadOf(createCmd({ tenantId: 'tenant-1' })));

      expect(dlq.sendToDlq).toHaveBeenCalledWith(
        TOPIC,
        expect.anything(),
        expect.anything(),
        expect.stringContaining('name is required'),
      );
    });

    it('DLQs an update targeting a missing customer without retrying', async () => {
      repo.update.mockResolvedValue({ affected: 0 });

      await run(payloadOf({ op: 'update', correlationId: 'c1', data: { id: 9, tenantId: 'tenant-1' } }));

      expect(repo.update).toHaveBeenCalledTimes(1); // permanent — no retry
      expect(dlq.sendToDlq).toHaveBeenCalledWith(
        TOPIC,
        expect.anything(),
        expect.anything(),
        expect.stringContaining('customer not found'),
      );
    });
  });

  // ── Successful writes ────────────────────────────────────

  describe('successful writes', () => {
    it('inserts a customer with defaults and the correlationId for idempotency', async () => {
      await run(
        payloadOf(createCmd({ tenantId: 'tenant-1', name: 'Tienda La Paz' }, 'corr-42')),
      );

      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          name: 'Tienda La Paz',
          geofenceRadiusMeters: 100, // default
          customerType: 'regular', // default
          correlationId: 'corr-42',
        }),
      );
      expect(dlq.sendToDlq).not.toHaveBeenCalled();
    });

    it('updates only the fields present in the command', async () => {
      await run(
        payloadOf({
          op: 'update',
          correlationId: 'c1',
          data: { id: 9, tenantId: 'tenant-1', phone: '777-1234' },
        }),
      );

      const [criteria, fields] = repo.update.mock.calls[0];
      expect(criteria).toEqual({ id: '9', tenantId: 'tenant-1' });
      expect(fields).toEqual({ phone: '777-1234' });
    });
  });

  // ── At-least-once & retry semantics ──────────────────────

  describe('redelivery and retries', () => {
    it('treats a duplicate correlation_id as already-applied success (no DLQ, no retry)', async () => {
      const dup: any = new Error('ER_DUP_ENTRY');
      dup.code = 'ER_DUP_ENTRY';
      repo.insert.mockRejectedValue(dup);

      await run(payloadOf(createCmd({ tenantId: 'tenant-1', name: 'Tienda' })));

      expect(repo.insert).toHaveBeenCalledTimes(1);
      expect(dlq.sendToDlq).not.toHaveBeenCalled();
      expect(metrics.addDbError).not.toHaveBeenCalled();
    });

    it('retries transient DB errors with backoff and succeeds', async () => {
      repo.insert
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue(undefined);

      await run(payloadOf(createCmd({ tenantId: 'tenant-1', name: 'Tienda' })));

      expect(repo.insert).toHaveBeenCalledTimes(2);
      expect(metrics.addDbError).toHaveBeenCalledTimes(1);
      expect(dlq.sendToDlq).not.toHaveBeenCalled();
    });

    it('DLQs after exhausting all retries (4 attempts total)', async () => {
      repo.insert.mockRejectedValue(new Error('mysql gone away'));

      await run(payloadOf(createCmd({ tenantId: 'tenant-1', name: 'Tienda' })));

      expect(repo.insert).toHaveBeenCalledTimes(4); // initial + 3 retries
      expect(dlq.sendToDlq).toHaveBeenCalledWith(
        TOPIC,
        expect.anything(),
        expect.anything(),
        expect.stringContaining('DB error after retries'),
      );
    });
  });
});
