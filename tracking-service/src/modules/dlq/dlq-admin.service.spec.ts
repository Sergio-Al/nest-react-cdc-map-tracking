import { ConfigService } from '@nestjs/config';
import { Kafka } from 'kafkajs';
import { DlqAdminService, DlqMessage, DlqTopicName } from './dlq-admin.service';

jest.mock('kafkajs', () => ({ Kafka: jest.fn() }));

describe('DlqAdminService', () => {
  const commandTopics: DlqTopicName[] = [
    'commands.customers.dlq',
    'commands.orders.dlq',
    'commands.drivers.dlq',
  ];
  let service: DlqAdminService;
  let admin: { fetchTopicOffsets: jest.Mock; deleteGroups: jest.Mock };
  let producer: { connect: jest.Mock; send: jest.Mock; disconnect: jest.Mock };
  let consumer: {
    connect: jest.Mock;
    subscribe: jest.Mock;
    run: jest.Mock;
    disconnect: jest.Mock;
  };

  function message(headers: Record<string, string> = {}): DlqMessage {
    return {
      key: 'tenant-1',
      value: '{"op":"create","data":{"tenantId":"tenant-1"}}',
      headers,
      partition: 0,
      offset: '0',
      timestamp: '1',
    };
  }

  beforeEach(() => {
    admin = {
      fetchTopicOffsets: jest.fn().mockResolvedValue([{ high: '2' }]),
      deleteGroups: jest.fn().mockResolvedValue(undefined),
    };
    producer = {
      connect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    consumer = {
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn(async ({ eachMessage }) => {
        await eachMessage({
          partition: 0,
          message: {
            key: Buffer.from('tenant-1'),
            value: Buffer.from('command'),
            headers: { 'original-topic': Buffer.from('commands.orders') },
            offset: '0',
            timestamp: '1',
          },
        });
      }),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    (Kafka as jest.Mock).mockImplementation(() => ({
      admin: () => admin,
      producer: () => producer,
      consumer: () => consumer,
    }));
    service = new DlqAdminService({ get: () => 'localhost:9092' } as unknown as ConfigService);
  });

  it('lists command queues alongside existing DLQs', async () => {
    const topics = await service.listTopics();

    expect(topics).toHaveLength(7);
    for (const topic of commandTopics) {
      expect(topics).toContainEqual({ topic, messageCount: 2 });
    }
  });

  it.each(commandTopics)('allows peeking at %s', async (topic) => {
    const messages = await service.peekMessages(topic, 1);

    expect(consumer.subscribe).toHaveBeenCalledWith({ topic, fromBeginning: true });
    expect(messages).toEqual([
      expect.objectContaining({ value: 'command', headers: { 'original-topic': 'commands.orders' } }),
    ]);
    expect(consumer.disconnect).toHaveBeenCalled();
  });

  it.each(commandTopics)('replays %s to its source with integration headers or no headers', async (topic) => {
    const source = topic.slice(0, -'.dlq'.length);
    jest.spyOn(service, 'peekMessages').mockResolvedValue([
      message({ 'original-topic': source }),
      message(),
    ]);

    expect(await service.replayMessages(topic)).toEqual({ replayed: 2, errors: 0 });
    expect(producer.send).toHaveBeenCalledTimes(2);
    for (const [request] of producer.send.mock.calls) {
      expect(request).toEqual({
        topic: source,
        messages: [expect.objectContaining({ key: 'tenant-1', value: message().value })],
      });
    }
    expect(producer.disconnect).toHaveBeenCalled();
  });

  it('preserves per-message source routing for the shared CDC queue', async () => {
    jest.spyOn(service, 'peekMessages').mockResolvedValue([
      message({ 'x-original-topic': 'cdc.customers' }),
      message({ 'x-original-topic': 'cdc.orders' }),
      message(),
    ]);

    expect(await service.replayMessages('cdc.dlq')).toEqual({ replayed: 2, errors: 1 });
    expect(producer.send.mock.calls.map(([request]) => request.topic)).toEqual([
      'cdc.customers', 'cdc.orders',
    ]);
  });

  it('rejects unknown queues before consuming or replaying', async () => {
    const topic = 'unknown.dlq' as DlqTopicName;
    await expect(service.peekMessages(topic)).rejects.toThrow('Invalid DLQ topic');
    await expect(service.replayMessages(topic)).rejects.toThrow('Invalid DLQ topic');
    expect(consumer.connect).not.toHaveBeenCalled();
    expect(producer.connect).not.toHaveBeenCalled();
  });
});
