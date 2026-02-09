import { Injectable, Logger } from '@nestjs/common';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { TraccarPositionDto, TraccarEventDto } from './dto';

const TOPIC_POSITIONS = 'gps.positions';
const TOPIC_EVENTS = 'gps.events';

@Injectable()
export class TraccarIngestionService {
  private readonly logger = new Logger(TraccarIngestionService.name);

  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  /**
   * Receives a raw Traccar position and publishes it to Kafka.
   */
  async handlePosition(position: TraccarPositionDto): Promise<void> {
    this.logger.debug(
      `Position received – device=${position.deviceId} lat=${position.latitude} lng=${position.longitude} speed=${position.speed}`,
    );

    await this.kafkaProducer.produce(TOPIC_POSITIONS, {
      key: String(position.deviceId),
      value: JSON.stringify({
        deviceId: position.deviceId,
        latitude: position.latitude,
        longitude: position.longitude,
        altitude: position.altitude ?? 0,
        speed: position.speed ?? 0,
        course: position.course ?? 0,
        accuracy: position.accuracy,
        deviceTime: position.deviceTime,
        fixTime: position.fixTime,
        serverTime: position.serverTime,
        valid: position.valid ?? true,
        attributes: position.attributes ?? {},
      }),
    });
  }

  /**
   * Receives a batch of positions (Traccar can forward arrays).
   */
  async handlePositionBatch(positions: TraccarPositionDto[]): Promise<void> {
    this.logger.debug(`Position batch received – count=${positions.length}`);

    const messages = positions.map((pos) => ({
      key: String(pos.deviceId),
      value: JSON.stringify({
        deviceId: pos.deviceId,
        latitude: pos.latitude,
        longitude: pos.longitude,
        altitude: pos.altitude ?? 0,
        speed: pos.speed ?? 0,
        course: pos.course ?? 0,
        accuracy: pos.accuracy,
        deviceTime: pos.deviceTime,
        fixTime: pos.fixTime,
        serverTime: pos.serverTime,
        valid: pos.valid ?? true,
        attributes: pos.attributes ?? {},
      }),
    }));

    await this.kafkaProducer.produceBatch(TOPIC_POSITIONS, messages);
  }

  /**
   * Receives a Traccar event (ignition, alarm, geofence, etc.) and publishes to Kafka.
   */
  async handleEvent(event: TraccarEventDto): Promise<void> {
    this.logger.debug(
      `Event received – device=${event.deviceId} type=${event.type}`,
    );

    await this.kafkaProducer.produce(TOPIC_EVENTS, {
      key: String(event.deviceId),
      value: JSON.stringify(event),
    });
  }
}
