import {
  Controller,
  Get,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TimescaleService } from '../timescale/timescale.service';

@Controller('history')
export class HistoryController {
  constructor(private readonly timescaleService: TimescaleService) {}

  @Roles('admin', 'dispatcher')
  @Get('visits')
  async getVisitCompletions(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('driverId') driverId: string | undefined,
    @CurrentUser() user: any,
  ) {
    if (!from || !to) {
      throw new BadRequestException(
        'Query params "from" and "to" are required (ISO 8601)',
      );
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException(
        '"from" and "to" must be valid ISO 8601 dates',
      );
    }
    return this.timescaleService.getVisitCompletions(
      user.tenantId,
      fromDate,
      toDate,
      driverId,
    );
  }

  @Roles('admin', 'dispatcher')
  @Get('stats')
  async getDriverDailyStats(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: any,
  ) {
    if (!from || !to) {
      throw new BadRequestException(
        'Query params "from" and "to" are required (ISO 8601)',
      );
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException(
        '"from" and "to" must be valid ISO 8601 dates',
      );
    }
    return this.timescaleService.getDriverDailyStats(
      user.tenantId,
      fromDate,
      toDate,
    );
  }
}
