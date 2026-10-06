import { Injectable, Logger } from '@nestjs/common';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { CommandMessage } from './command.types';

@Injectable()
export class PipelineEventsService {
  private readonly logger = new Logger(PipelineEventsService.name);
  constructor(private readonly producer: KafkaProducerService) {}

  async emit(cmd: CommandMessage | undefined, entity: 'customers' | 'orders',
    stage: 'integration.consumed' | 'integration.retry' | 'mysql.committed' | 'dlq.sent',
    detail?: Record<string, unknown>): Promise<void> {
    const data = cmd?.data as { tenantId?: string } | undefined;
    if (!cmd?.correlationId || !data?.tenantId) return;
    const op = ['create', 'update', 'status'].includes(cmd.op) ? cmd.op : 'create';
    try {
      await this.producer.produce('pipeline.traces', {
        key: cmd.correlationId,
        value: JSON.stringify({ correlationId: cmd.correlationId, tenantId: data.tenantId,
          entity, op, stage, at: new Date().toISOString(), detail }),
      });
    } catch (err) {
      this.logger.warn(`Pipeline event unavailable: ${(err as Error).message}`);
    }
  }
}
