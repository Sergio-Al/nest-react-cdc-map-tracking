import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { TrackingGateway } from './tracking.gateway';
import { EnrichedPosition } from '../enrichment/enrichment.types';
import { VisitEvent } from './ws.types';

/**
 * Service that bridges Kafka topics to WebSocket broadcasts.
 * Consumes enriched positions and visit events, then pushes them to connected clients.
 */
@Injectable()
export class WsBroadcastService implements OnModuleInit {
  private readonly logger = new Logger(WsBroadcastService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly trackingGateway: TrackingGateway,
  ) {}

  async onModuleInit() {
    // Register handler for enriched GPS positions (with retry + DLQ)
    this.kafkaConsumer.registerHandler({
      topic: 'gps.positions.enriched',
      fromBeginning: false,
      retryPolicy: { maxRetries: 2, baseDelayMs: 50 },
      handler: async (payload) => {
        const position: EnrichedPosition = JSON.parse(payload.message.value!.toString());
        this.trackingGateway.broadcastPosition(position);
      },
    });

    // Register handler for visit lifecycle events (with retry + DLQ)
    this.kafkaConsumer.registerHandler({
      topic: 'visits.events',
      fromBeginning: false,
      retryPolicy: { maxRetries: 2, baseDelayMs: 50 },
      handler: async (payload) => {
        const visitEvent: VisitEvent = JSON.parse(payload.message.value!.toString());
        this.trackingGateway.broadcastVisitEvent(visitEvent);
      },
    });

    this.logger.log('WebSocket broadcast service initialized (Kafka → WebSocket bridge)');
  }
}
