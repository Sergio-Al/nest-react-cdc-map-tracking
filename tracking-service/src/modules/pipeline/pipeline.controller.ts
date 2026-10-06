import { Controller, Get, Param, Query, DefaultValuePipe, ParseIntPipe, NotFoundException } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PipelineTraceService } from './pipeline-trace.service';

@Controller('pipeline')
@Roles('admin', 'dispatcher')
export class PipelineController {
  constructor(private readonly traces: PipelineTraceService) {}

  @Get('traces')
  list(@CurrentUser() user: any,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number) {
    return this.traces.list(user.tenantId, Math.min(100, Math.max(1, limit)));
  }

  @Get('traces/:correlationId')
  async get(@CurrentUser() user: any, @Param('correlationId') id: string) {
    const trace = await this.traces.get(user.tenantId, id);
    if (!trace) throw new NotFoundException({ errorCode: 'pipeline.traceNotFound', args: { id } });
    return trace;
  }
}
