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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { FeatureGuard } from '../subscriptions/guards/feature.guard';
import { RequiresFeature } from '../subscriptions/decorators/requires-feature.decorator';
import { RoutesService } from './routes.service';
import { RouteOptimizerService } from './route-optimizer.service';
import { TimescaleService } from '../timescale/timescale.service';
import { CreateRouteDto, UpdateRouteDto } from './dto/route.dto';
import { ReorderVisitsDto } from './dto/route-optimizer.dto';

@Controller('routes')
export class RoutesController {
  constructor(
    private readonly routesService: RoutesService,
    private readonly routeOptimizer: RouteOptimizerService,
    private readonly timescaleService: TimescaleService,
  ) {}

  @Roles('admin', 'dispatcher')
  @Post()
  create(@Body() dto: CreateRouteDto, @CurrentUser() user: any) {
    dto.tenantId = user.tenantId; // enforce tenant from JWT
    return this.routesService.create(dto);
  }

  @Get()
  findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @CurrentUser() user?: any,
  ) {
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        throw new BadRequestException({ errorCode: 'routes.fromToInvalid' });
      }
      return this.routesService.findByDateRange(user.tenantId, from, to, status);
    }
    return this.routesService.findAll(user.tenantId);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.routesService.findById(id, user.tenantId);
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
    return this.routesService.update(id, dto, user.tenantId);
  }

  @Roles('admin', 'dispatcher')
  @UseGuards(FeatureGuard)
  @RequiresFeature('route_optimization')
  @Post(':id/optimize')
  async optimize(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    await this.routesService.findById(id, user.tenantId); // 404s cross-tenant before optimizing
    return this.routeOptimizer.optimizeRoute(id);
  }

  @Get(':id/geometry')
  async getGeometry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    await this.routesService.findById(id, user.tenantId); // 404s cross-tenant
    return this.routeOptimizer.getRouteGeometry(id);
  }

  @Roles('admin', 'dispatcher')
  @Patch(':id/reorder')
  async reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderVisitsDto,
    @CurrentUser() user: any,
  ) {
    await this.routesService.findById(id, user.tenantId); // 404s cross-tenant
    return this.routeOptimizer.reorderVisits(id, dto);
  }

  @Get(':id/history')
  async getRouteHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: any,
  ) {
    if (!from || !to) {
      throw new BadRequestException({ errorCode: 'routes.fromToRequired' });
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException({ errorCode: 'routes.fromToInvalid' });
    }
    return this.timescaleService.getRoutePositionHistory(id, fromDate, toDate, user.tenantId);
  }
}
