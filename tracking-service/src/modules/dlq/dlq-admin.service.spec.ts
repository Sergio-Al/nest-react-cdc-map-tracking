import { PipelineTraceService } from '../pipeline/pipeline-trace.service';
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
  let traces: { append: jest.Mock };
  let service: DlqAdminService;
  let admin: { fetchTopicOffsets: jest.Mock; fetchOffsets: jest.Mock; setOffsets: jest.Mock; deleteGroups: jest.Mock };
  let producer: { connect: jest.Mock; send: jest.Mock; disconnect: jest.Mock };
  let consumer: {
    connect: jest.Mock;
    subscribe: jest.Mock;
    run: jest.Mock;
    disconnect: jest.Mock;
  };

  function message(headers: Record<string, string> = {}, offset = '0', replayed = false): DlqMessage {
    return {
      key: 'tenant-1',
      value: '{"op":"create","correlationId":"corr-1","data":{"tenantId":"tenant-1"}}',
      headers,
      partition: 0,
      offset,
      timestamp: '1',
      replayed,
    };
  }

  beforeEach(() => {
    traces = { append: jest.fn() };
    admin = {
      fetchTopicOffsets: jest.fn().mockResolvedValue([{ partition: 0, low: '0', high: '2' }]),
      fetchOffsets: jest.fn().mockResolvedValue([{ topic: 'any', partitions: [{ partition: 0, offset: '-1' }] }]),
      setOffsets: jest.fn().mockResolvedValue(undefined),
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
    service = new DlqAdminService({ get: () => 'localhost:9092' } as unknown as ConfigService, traces as unknown as PipelineTraceService);
  });

  it('lists command queues alongside existing DLQs', async () => {
    const topics = await service.listTopics();

    expect(topics).toHaveLength(7);
    for (const topic of commandTopics) {
      expect(topics).toContainEqual({ topic, messageCount: 2, pendingCount: 2 });
    }
  });

  it('counts only records past the replay cursor as pending', async () => {
    admin.fetchOffsets.mockResolvedValue([{ topic: 'any', partitions: [{ partition: 0, offset: '1' }] }]);
    const topics = await service.listTopics();
    expect(topics).toContainEqual({ topic: 'commands.customers.dlq', messageCount: 2, pendingCount: 1 });
  });

  it('marks peeked records behind the replay cursor as replayed', async () => {
    admin.fetchOffsets.mockResolvedValue([{ topic: 'any', partitions: [{ partition: 0, offset: '1' }] }]);
    const [peeked] = await service.peekMessages('commands.customers.dlq', 1);
    expect(peeked.replayed).toBe(true);
  });

  it('replays only pending records and advances the cursor past them', async () => {
    jest.spyOn(service, 'peekMessages').mockResolvedValue([
      message({}, '0', true),
      message({}, '1'),
      message({}, '2'),
    ]);

    expect(await service.replayMessages('commands.customers.dlq')).toEqual({ replayed: 2, errors: 0 });
    expect(producer.send).toHaveBeenCalledTimes(2);
    expect(admin.setOffsets).toHaveBeenCalledWith({
      groupId: 'dlq-replay-commands.customers.dlq',
      topic: 'commands.customers.dlq',
      partitions: [{ partition: 0, offset: '3' }],
    });
  });

  it('does nothing when every record was already replayed', async () => {
    jest.spyOn(service, 'peekMessages').mockResolvedValue([message({}, '0', true)]);
    expect(await service.replayMessages('commands.customers.dlq')).toEqual({ replayed: 0, errors: 0 });
    expect(producer.connect).not.toHaveBeenCalled();
    expect(admin.setOffsets).not.toHaveBeenCalled();
  });

  it('stops a partition at a failed send so it is retried next time', async () => {
    jest.spyOn(service, 'peekMessages').mockResolvedValue([message({}, '0'), message({}, '1'), message({}, '2')]);
    producer.send
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Kafka unavailable'));

    expect(await service.replayMessages('commands.customers.dlq')).toEqual({ replayed: 1, errors: 1 });
    expect(producer.send).toHaveBeenCalledTimes(2);
    expect(admin.setOffsets).toHaveBeenCalledWith(expect.objectContaining({
      partitions: [{ partition: 0, offset: '1' }],
    }));
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
    expect(traces.append).toHaveBeenCalledWith('corr-1', 'dlq.replayed', undefined, expect.any(String));
    for (const [request] of producer.send.mock.calls) {
      expect(request).toEqual({
        topic: source,
        messages: [expect.objectContaining({ key: 'tenant-1', value: message().value })],
      });
    }
    expect(producer.disconnect).toHaveBeenCalled();
  });

  it('does not mark a failed Kafka replay as replayed', async () => {
    jest.spyOn(service, 'peekMessages').mockResolvedValue([message()]);
    producer.send.mockRejectedValue(new Error('Kafka unavailable'));
    expect(await service.replayMessages('commands.customers.dlq')).toEqual({ replayed: 0, errors: 1 });
    expect(traces.append).not.toHaveBeenCalled();
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
