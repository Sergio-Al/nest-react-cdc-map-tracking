import {
  Controller,
  Get,
  Query,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TimescaleService } from '../timescale/timescale.service';
import { FeatureGuard } from '../subscriptions/guards/feature.guard';
import { RequiresFeature } from '../subscriptions/decorators/requires-feature.decorator';

// Reporting/analytics endpoints — gated behind the 'reports' plan feature.
@UseGuards(FeatureGuard)
@RequiresFeature('reports')
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
    const { fromDate, toDate } = this.parseRange(from, to);
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
    const { fromDate, toDate } = this.parseRange(from, to);
    return this.timescaleService.getDriverDailyStats(
      user.tenantId,
      fromDate,
      toDate,
    );
  }

  /**
   * Parse the `from`/`to` query dates. The dashboard sends date-only ranges
   * (`yyyy-mm-dd` → midnight UTC); without adjustment, `time <= to` makes a
   * single-day selection (`from === to`) a zero-width window that matches
   * nothing, and a multi-day range silently drops the end day. So when `to`
   * carries no explicit time, extend it to the end of that day (inclusive).
   */
  private parseRange(from: string, to: string): { fromDate: Date; toDate: Date } {
    if (!from || !to) {
      throw new BadRequestException({ errorCode: 'history.fromToRequired' });
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException({ errorCode: 'history.fromToInvalid' });
    }
    if (!to.includes('T') && !to.includes(':')) {
      toDate.setUTCHours(23, 59, 59, 999);
    }
    return { fromDate, toDate };
  }
}
