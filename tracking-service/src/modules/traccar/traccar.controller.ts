import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { TraccarIngestionService } from './traccar-ingestion.service';
import { TraccarPositionDto, TraccarEventDto } from './dto';

@Public()
@UseGuards(ApiKeyGuard)
@Controller('traccar')
export class TraccarController {
  private readonly logger = new Logger(TraccarController.name);

  constructor(private readonly ingestionService: TraccarIngestionService) {}

  /**
   * Traccar webhook endpoint for forwarded positions.
   * Traccar may send a single object or an array.
   */
  @Post('positions')
  @HttpCode(HttpStatus.OK)
  async receivePositions(@Body() body: TraccarPositionDto | TraccarPositionDto[]) {
    if (Array.isArray(body)) {
      await this.ingestionService.handlePositionBatch(body);
    } else {
      await this.ingestionService.handlePosition(body);
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
}
