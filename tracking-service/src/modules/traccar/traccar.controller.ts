import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { TraccarIngestionService } from './traccar-ingestion.service';
import { TraccarPositionDto, TraccarEventDto } from './dto';

@Public()
@Controller('traccar')
export class TraccarController {
  private readonly logger = new Logger(TraccarController.name);

  constructor(private readonly ingestionService: TraccarIngestionService) {}

  /**
   * Traccar webhook endpoint for forwarded positions.
   *
   * Traccar 6.x PositionForwarderJson sends a PositionData wrapper:
   *   { position: { id, deviceId, latitude, ... }, device: { uniqueId, ... } }
   *
   * Legacy/manual format sends flat objects or arrays.
   */
  @Post('positions')
  @HttpCode(HttpStatus.OK)
  async receivePositions(@Body() body: any) {
    const positions = this.normalizePositions(body);

    if (positions.length === 0) {
      this.logger.warn('Received empty or unrecognised position payload');
      return { status: 'ok' };
    }

    if (positions.length === 1) {
      await this.ingestionService.handlePosition(positions[0]);
    } else {
      await this.ingestionService.handlePositionBatch(positions);
    }

    return { status: 'ok' };
  }

  /**
   * Traccar webhook endpoint for forwarded events.
   */
  @Post('events')
  @HttpCode(HttpStatus.OK)
  async receiveEvents(@Body() body: TraccarEventDto) {
    await this.ingestionService.handleEvent(body);
    return { status: 'ok' };
  }

  // ── helpers ───────────────────────────────────────────────

  /**
   * Detect Traccar 6.x PositionData wrapper format vs. flat format.
   */
  private normalizePositions(body: any): TraccarPositionDto[] {
    // Traccar 6.x PositionData: { position: {...}, device: {...} }
    if (body?.position && typeof body.position === 'object') {
      this.logger.debug(
        `PositionData wrapper – device=${body.device?.uniqueId}`,
      );
      return [this.unwrapPositionData(body.position, body.device)];
    }

    // Array of flat positions
    if (Array.isArray(body)) {
      return body.map((item: any) =>
        item.position
          ? this.unwrapPositionData(item.position, item.device)
          : item,
      );
    }

    // Single flat position (legacy / manual curl)
    if (body?.deviceId !== undefined && body?.latitude !== undefined) {
      return [body as TraccarPositionDto];
    }

    return [];
  }

  /**
   * Map the nested Traccar PositionData into the flat DTO the ingestion service
   * expects.  Also injects device.uniqueId into attributes so the enrichment
   * pipeline can resolve the driver.
   */
  private unwrapPositionData(
    pos: Record<string, any>,
    device?: Record<string, any>,
  ): TraccarPositionDto {
    return {
      id: String(pos.id ?? ''),
      deviceId: device?.uniqueId ?? String(pos.deviceId ?? ''),
      protocol: pos.protocol,
      deviceTime: pos.deviceTime,
      fixTime: pos.fixTime,
      serverTime: pos.serverTime,
      outdated: pos.outdated,
      valid: pos.valid,
      latitude: pos.latitude,
      longitude: pos.longitude,
      altitude: pos.altitude,
      speed: pos.speed,
      course: pos.course,
      accuracy: pos.accuracy,
      attributes: {
        ...(pos.attributes ?? {}),
        uniqueId: device?.uniqueId,
      },
    };
  }
}
