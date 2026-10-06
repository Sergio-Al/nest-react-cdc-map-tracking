import { ConfigService } from '@nestjs/config';
import { Kafka } from 'kafkajs';
import { KafkaConsumerService } from './kafka-consumer.service';
import { DlqService } from './dlq.service';
jest.mock('kafkajs', () => ({ Kafka: jest.fn() }));

describe('optional Kafka topics', () => {
  it('still runs existing topic handlers when the optional pipeline topic is missing', async () => {
    const consumer = { connect: jest.fn(), subscribe: jest.fn(async ({ topic }) => {
      if (topic === 'pipeline.traces') throw new Error('Unknown topic');
    }), run: jest.fn(), disconnect: jest.fn() };
    (Kafka as jest.Mock).mockImplementation(() => ({ consumer: () => consumer }));
    const service = new KafkaConsumerService({ get: () => 'test' } as unknown as ConfigService, {} as DlqService);
    service.registerHandler({ topic: 'pipeline.traces', optional: true, handler: jest.fn() });
    service.registerHandler({ topic: 'gps.positions', handler: jest.fn() });
    await service.onApplicationBootstrap();
    expect(consumer.subscribe).toHaveBeenCalledWith({ topic: 'gps.positions', fromBeginning: false });
    expect(consumer.run).toHaveBeenCalled();
  });
});
