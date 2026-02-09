import { Controller, Get, Param, Query, BadRequestException } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { DriversService } from './drivers.service';
import { TimescaleService } from '../timescale/timescale.service';

@Controller('drivers')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly timescaleService: TimescaleService,
  ) {}

  @Roles('admin', 'dispatcher')
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.driversService.findAll(user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.driversService.findOne(id);
  }

  @Get(':id/position')
  async getPosition(@Param('id') id: string, @CurrentUser() user: any) {
    const positions = await this.driversService.getLatestPositions(user.tenantId);
    return positions.find((p) => p.driverId === id) ?? null;
  }

  @Get('positions/all')
  getLatestPositions(@CurrentUser() user: any) {
    return this.driversService.getLatestPositions(user.tenantId);
  }

  @Get(':id/history')
  async getDriverHistory(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: any,
  ) {
    if (!from || !to) {
      throw new BadRequestException('Query params "from" and "to" are required (ISO 8601)');
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('"from" and "to" must be valid ISO 8601 dates');
    }
    // Drivers can only see their own history
    if (user.role === 'driver' && user.driverId !== id) {
      return [];
    }
    return this.timescaleService.getDriverPositionHistory(id, fromDate, toDate);
  }
}
