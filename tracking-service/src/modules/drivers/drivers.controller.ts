import {
  Controller, Get, Param, Query, BadRequestException, ForbiddenException,
  Post, Patch, Delete, Body, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { DriversService } from './drivers.service';
import { TimescaleService } from '../timescale/timescale.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { PairDeviceDto } from './dto/pair-device.dto';

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

  @Get('positions/all')
  getLatestPositions(@CurrentUser() user: any) {
    return this.driversService.getLatestPositions(user.tenantId);
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
    return this.timescaleService.getDriverPositionHistory(id, fromDate, toDate);
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
