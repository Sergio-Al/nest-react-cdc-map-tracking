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
    // Register handler for enriched GPS positions
    this.kafkaConsumer.registerHandler({
      topic: 'gps.positions.enriched',
      fromBeginning: false,
      handler: async (payload) => {
        try {
          const position: EnrichedPosition = JSON.parse(payload.message.value!.toString());
          this.trackingGateway.broadcastPosition(position);
        } catch (error) {
          this.logger.error(
            'Failed to process enriched position for WebSocket broadcast',
            error,
          );
        }
      },
    });

    // Register handler for visit lifecycle events
    this.kafkaConsumer.registerHandler({
      topic: 'visits.events',
      fromBeginning: false,
      handler: async (payload) => {
        try {
          const visitEvent: VisitEvent = JSON.parse(payload.message.value!.toString());
          this.trackingGateway.broadcastVisitEvent(visitEvent);
        } catch (error) {
          this.logger.error(
            'Failed to process visit event for WebSocket broadcast',
            error,
          );
        }
      },
    });

    this.logger.log('WebSocket broadcast service initialized (Kafka → WebSocket bridge)');
  }
}
