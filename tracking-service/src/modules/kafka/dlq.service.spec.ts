import { Test, TestingModule } from '@nestjs/testing';
import { DlqService } from './dlq.service';
import { KafkaProducerService } from './kafka-producer.service';

describe('DlqService', () => {
  let dlqService: DlqService;
  let kafkaProducer: jest.Mocked<KafkaProducerService>;

  beforeEach(async () => {
    const mockProducer = {
      produce: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DlqService,
        { provide: KafkaProducerService, useValue: mockProducer },
      ],
    }).compile();

    dlqService = module.get<DlqService>(DlqService);
    kafkaProducer = module.get(KafkaProducerService);
  });

  // ── publishToDlq ────────────────────────────────────────

  describe('publishToDlq', () => {
    it('should publish to the correct DLQ topic for GPS positions', async () => {
      const error = new Error('Connection timeout');

      await dlqService.publishToDlq(
        'gps.positions',
        'device-1',
        '{"lat": 1}',
        error,
        { partition: 0, offset: '42', retryCount: 3 },
      );

      expect(kafkaProducer.produce).toHaveBeenCalledWith(
        'gps.positions.dlq',
        expect.objectContaining({
          key: 'device-1',
          value: '{"lat": 1}',
          headers: expect.objectContaining({
            'x-original-topic': 'gps.positions',
            'x-error-message': 'Connection timeout',
            'x-retry-count': '3',
            'x-original-partition': '0',
            'x-original-offset': '42',
          }),
        }),
      );
    });

    it('should route CDC topics to shared cdc.dlq', async () => {
      await dlqService.publishToDlq(
        'cdc.customers',
        'key-1',
        '{}',
        new Error('DB error'),
      );

      expect(kafkaProducer.produce).toHaveBeenCalledWith(
        'cdc.dlq',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-original-topic': 'cdc.customers',
          }),
        }),
      );
    });

    it('should route cdc.accounts to shared cdc.dlq', async () => {
      await dlqService.publishToDlq('cdc.accounts', undefined, '{}', new Error('fail'));

      expect(kafkaProducer.produce).toHaveBeenCalledWith(
        'cdc.dlq',
        expect.anything(),
      );
    });

    it('should increment DLQ counters', async () => {
      expect(dlqService.getTotalDlqCount()).toBe(0);

      await dlqService.publishToDlq('gps.positions', undefined, '{}', new Error('fail'));
      await dlqService.publishToDlq('gps.positions', undefined, '{}', new Error('fail'));
      await dlqService.publishToDlq('cdc.customers', undefined, '{}', new Error('fail'));

      expect(dlqService.getTotalDlqCount()).toBe(3);
      const counts = dlqService.getDlqCounts();
      expect(counts['gps.positions.dlq']).toBe(2);
      expect(counts['cdc.dlq']).toBe(1);
    });

    it('should not throw if DLQ publish itself fails', async () => {
      kafkaProducer.produce.mockRejectedValueOnce(new Error('Kafka down'));

      await expect(
        dlqService.publishToDlq('gps.positions', undefined, '{}', new Error('x')),
      ).resolves.toBeUndefined();
    });

    it('should truncate long error stacks', async () => {
      const longStack = 'x'.repeat(2000);
      const error = new Error('fail');
      error.stack = longStack;

      await dlqService.publishToDlq('gps.positions', undefined, '{}', error);

      const call = kafkaProducer.produce.mock.calls[0];
      const headers = call[1].headers!;
      expect(headers['x-error-stack'].length).toBeLessThanOrEqual(1000);
    });
  });

  // ── withRetry ────────────────────────────────────────────

  describe('withRetry', () => {
    it('should return success on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('result');

      const result = await dlqService.withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
      });

      expect(result).toEqual({ success: true, result: 'result' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient errors and succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('ok');

      const result = await dlqService.withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
      });

      expect(result).toEqual({ success: true, result: 'ok' });
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should exhaust retries on persistent transient errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await dlqService.withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 10,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.retryCount).toBe(2);
        expect(result.error.message).toBe('ECONNREFUSED');
      }
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should skip retries for permanent errors (JSON parse)', async () => {
      const fn = jest.fn().mockRejectedValue(new SyntaxError('Unexpected token'));

      const result = await dlqService.withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.retryCount).toBe(0); // No retries for permanent error
      }
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should skip retries for validation errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Validation failed'));

      const result = await dlqService.withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
      });

      expect(result.success).toBe(false);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should apply exponential backoff timing', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('timeout'));
      const start = Date.now();

      await dlqService.withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 50,
      });

      const elapsed = Date.now() - start;
      // 50ms (first retry) + 100ms (second retry) = ~150ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it('should handle non-Error rejections', async () => {
      const fn = jest.fn().mockRejectedValue('string error');

      const result = await dlqService.withRetry(fn, {
        maxRetries: 1,
        baseDelayMs: 10,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('string error');
      }
    });
  });

  // ── getDlqCounts / getTotalDlqCount ──────────────────────

  describe('metrics', () => {
    it('should start with zero counts', () => {
      expect(dlqService.getTotalDlqCount()).toBe(0);
      expect(dlqService.getDlqCounts()).toEqual({});
    });
  });
});
