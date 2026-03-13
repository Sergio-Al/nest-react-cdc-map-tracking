import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { DlqAdminService, DlqTopicName } from './dlq-admin.service';
import { DlqService } from '../kafka/dlq.service';

/**
 * Admin-only REST endpoints for inspecting and managing dead-letter queues.
 */
@Controller('dlq')
@Roles('admin')
export class DlqController {
  constructor(
    private readonly dlqAdminService: DlqAdminService,
    private readonly dlqService: DlqService,
  ) {}

  /**
   * GET /api/dlq/topics — List all DLQ topics with message counts.
   */
  @Get('topics')
  async listTopics() {
    const topics = await this.dlqAdminService.listTopics();
    const inMemoryCounts = this.dlqService.getDlqCounts();
    return {
      topics,
      sessionCounts: inMemoryCounts,
      totalSessionMessages: this.dlqService.getTotalDlqCount(),
    };
  }

  /**
   * GET /api/dlq/:topic/messages?limit=20 — Peek at DLQ messages.
   */
  @Get(':topic/messages')
  async peekMessages(
    @Param('topic') topic: DlqTopicName,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const messages = await this.dlqAdminService.peekMessages(topic, limit);
    return {
      topic,
      count: messages.length,
      messages,
    };
  }

  /**
   * POST /api/dlq/:topic/replay?limit=100 — Replay DLQ messages to original topics.
   */
  @Post(':topic/replay')
  async replayMessages(
    @Param('topic') topic: DlqTopicName,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const result = await this.dlqAdminService.replayMessages(topic, limit);
    return {
      topic,
      ...result,
    };
  }
}
