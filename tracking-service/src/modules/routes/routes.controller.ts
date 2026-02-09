import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoutesService } from './routes.service';
import { TimescaleService } from '../timescale/timescale.service';
import { CreateRouteDto, UpdateRouteDto } from './dto/route.dto';

@Controller('routes')
export class RoutesController {
  constructor(
    private readonly routesService: RoutesService,
    private readonly timescaleService: TimescaleService,
  ) {}

  @Roles('admin', 'dispatcher')
  @Post()
  create(@Body() dto: CreateRouteDto, @CurrentUser() user: any) {
    return this.routesService.create(dto);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.routesService.findAll(user.tenantId);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.routesService.findById(id);
  }

  @Get('driver/:driverId/active')
  findActiveByDriver(@Param('driverId', ParseUUIDPipe) driverId: string, @CurrentUser() user: any) {
    // Drivers can only see their own routes
    if (user.role === 'driver' && user.driverId !== driverId) {
      return [];
    }
    return this.routesService.findActiveByDriver(driverId);
  }

  @Get('driver/:driverId/today')
  findTodayByDriver(@Param('driverId', ParseUUIDPipe) driverId: string, @CurrentUser() user: any) {
    // Drivers can only see their own routes
    if (user.role === 'driver' && user.driverId !== driverId) {
      return [];
    }
    return this.routesService.findTodayByDriver(driverId);
  }

  @Roles('admin', 'dispatcher')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRouteDto, @CurrentUser() user: any) {
    return this.routesService.update(id, dto);
  }

  @Get(':id/history')
  async getRouteHistory(
    @Param('id', ParseUUIDPipe) id: string,
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
    return this.timescaleService.getRoutePositionHistory(id, fromDate, toDate);
  }
}
