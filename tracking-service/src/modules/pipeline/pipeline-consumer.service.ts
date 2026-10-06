import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { PipelineTraceService } from './pipeline-trace.service';
import { PIPELINE_STAGES, PipelineEvent } from './pipeline.types';

@Injectable()
export class PipelineConsumerService implements OnModuleInit {
  private readonly logger = new Logger(PipelineConsumerService.name);
  constructor(private readonly consumer: KafkaConsumerService, private readonly traces: PipelineTraceService) {}
  onModuleInit() {
    this.consumer.registerHandler({ topic: 'pipeline.traces', fromBeginning: false, optional: true,
      handler: async ({ message }) => {
        try {
          const event: PipelineEvent = JSON.parse(message.value?.toString() ?? 'null');
          if (!event?.correlationId || !event.tenantId || !['customers', 'orders'].includes(event.entity)
            || !['create', 'update', 'status'].includes(event.op) || !PIPELINE_STAGES.includes(event.stage)
            || !Number.isFinite(Date.parse(event.at))) return;
          await this.traces.start({ ...event, mode: 'integrated' }, event.at, false);
          await this.traces.append(event.correlationId, event.stage, event.detail, event.at);
        } catch (err) { this.logger.warn(`Invalid pipeline event: ${(err as Error).message}`); }
      },
    });
  }
}
