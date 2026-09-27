import {
  Controller, Get, Param, Query, BadRequestException, ForbiddenException,
  Post, Patch, Delete, Body, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { DriversService } from './drivers.service';
import { TimescaleService } from '../timescale/timescale.service';
import { DriverEventsService } from './driver-events.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { PairDeviceDto } from './dto/pair-device.dto';
import { CreateDriverLoginDto } from './dto/create-driver-login.dto';

/** Events/distance scan raw positions — keep windows to about a day. */
const DAY_RANGE_MAX_H = 48;

function parseDayRange(from: string, to: string): { fromDate: Date; toDate: Date } {
  if (!from || !to) {
    throw new BadRequestException({ errorCode: 'drivers.fromToRequired' });
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || toDate < fromDate) {
    throw new BadRequestException({ errorCode: 'drivers.fromToInvalid' });
  }
  if (toDate.getTime() - fromDate.getTime() > DAY_RANGE_MAX_H * 3600_000) {
    throw new BadRequestException({
      errorCode: 'drivers.rangeTooLarge',
      args: { max: DAY_RANGE_MAX_H },
    });
  }
  return { fromDate, toDate };
}

@Controller('drivers')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly timescaleService: TimescaleService,
    private readonly driverEventsService: DriverEventsService,
  ) {}

  @Roles('admin', 'dispatcher')
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.driversService.findAll(user.tenantId);
  }

  @Get('positions/all')
  getLatestPositions(@CurrentUser() user: any) {
    return this.driversService.getLatestPositions(user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.driversService.findOne(id, user.tenantId);
  }

  @Get(':id/position')
  async getPosition(@Param('id') id: string, @CurrentUser() user: any) {
    const positions = await this.driversService.getLatestPositions(user.tenantId);
    return positions.find((p) => p.driverId === id) ?? null;
  }

  /**
   * Derived activity feed for the dashboard driver panel: visit lifecycle
   * (arrived/completed/departed/skipped/failed) + shift start, idle and
   * speeding detected from the position history. Newest first.
   */
  @Get(':id/events')
  async getDriverEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: any,
  ) {
    const { fromDate, toDate } = parseDayRange(from, to);
    // Drivers can only see their own feed (same rule as history)
    if (user.role === 'driver' && user.driverId !== id) {
      return [];
    }
    return this.driverEventsService.getEvents(id, user.tenantId, fromDate, toDate);
  }

  /** Distance driven in a window (typically the user's local day), computed server-side. */
  @Get(':id/distance')
  async getDriverDistance(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: any,
  ) {
    const { fromDate, toDate } = parseDayRange(from, to);
    if (user.role === 'driver' && user.driverId !== id) {
      return { distanceKm: 0 };
    }
    const km = await this.timescaleService.getDriverDistanceKm(id, fromDate, toDate, user.tenantId);
    return { distanceKm: Math.round(km * 100) / 100 };
  }

  @Get(':id/history')
  async getDriverHistory(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: any,
  ) {
    if (!from || !to) {
      throw new BadRequestException({ errorCode: 'drivers.fromToRequired' });
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException({ errorCode: 'drivers.fromToInvalid' });
    }
    // Drivers can only see their own history
    if (user.role === 'driver' && user.driverId !== id) {
      return [];
    }
    return this.timescaleService.getDriverPositionHistory(id, fromDate, toDate, user.tenantId);
  }

  @Roles('admin', 'dispatcher')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDriver(@Body() dto: CreateDriverDto, @CurrentUser() user: any) {
    dto.tenantId = user.tenantId; // enforce tenant from JWT
    return this.driversService.createDriver(dto);
  }

  @Roles('admin', 'dispatcher')
  @Patch(':id')
  updateDriver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
    @CurrentUser() user: any,
  ) {
    return this.driversService.updateDriver(id, user.tenantId, dto);
  }

  @Roles('admin', 'dispatcher')
  @Delete(':id')
  deactivateDriver(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.driversService.deactivateDriver(id, user.tenantId);
  }

  // Create a login account for a driver. Tenant is taken from the admin's JWT
  // (server-authoritative), not the body.
  @Roles('admin', 'dispatcher')
  @Post(':id/login')
  @HttpCode(HttpStatus.CREATED)
  createLogin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDriverLoginDto,
    @CurrentUser() user: any,
  ) {
    return this.driversService.createLogin(id, user.tenantId, dto);
  }

  // Self-serve device provisioning for the driver mobile app. Derives + returns
  // a stable device id for the authenticated driver and registers it in Traccar,
  // so the app can start streaming GPS (OsmAnd protocol) without an admin
  // pre-pairing step. Idempotent — safe to call on every login.
  @Roles('driver')
  @Post('me/device')
  @HttpCode(HttpStatus.OK)
  provisionMyDevice(@CurrentUser() user: any) {
    if (!user.driverId) {
      throw new ForbiddenException({ errorCode: 'auth.insufficientPermissions' });
    }
    return this.driversService.provisionAppDevice(user.driverId, user.tenantId);
  }

  // Managers may pair anyone; a driver may pair only their own device.
  @Roles('admin', 'dispatcher', 'driver')
  @Patch(':id/device')
  pairDevice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PairDeviceDto,
    @CurrentUser() user: any,
  ) {
    if (user.role === 'driver' && user.driverId !== id) {
      throw new ForbiddenException({ errorCode: 'auth.insufficientPermissions' });
    }
    return this.driversService.pairDevice(id, user.tenantId, dto.deviceId);
  }

}
