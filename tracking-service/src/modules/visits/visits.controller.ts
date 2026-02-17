import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { VisitsService } from './visits.service';
import { CreateVisitDto, UpdateVisitStatusDto } from './dto/visit.dto';

@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Roles('admin', 'dispatcher')
  @Post()
  create(@Body() dto: CreateVisitDto, @CurrentUser() user: any) {
    return this.visitsService.create(dto);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.visitsService.findById(id);
  }

  @Get('route/:routeId')
  findByRoute(@Param('routeId', ParseUUIDPipe) routeId: string, @CurrentUser() user: any) {
    return this.visitsService.findByRoute(routeId);
  }

  @Get('driver/:driverId')
  findByDriver(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query('date') date: string | undefined,
    @CurrentUser() user: any,
  ) {
    // Drivers can only see their own visits
    if (user.role === 'driver' && user.driverId !== driverId) {
      throw new ForbiddenException('Cannot access other drivers visits');
    }
    return this.visitsService.findByDriver(driverId, date);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisitStatusDto,
    @CurrentUser() user: any,
  ) {
    // If user is a driver, verify they own this visit
    if (user.role === 'driver') {
      const visit = await this.visitsService.findById(id);
      const route = await this.visitsService['routesService'].findById(visit.routeId);
      if (route.driverId !== user.driverId) {
        throw new ForbiddenException('Cannot update visits for other drivers');
      }
    }
    return this.visitsService.updateStatus(id, dto);
  }

  @Roles('admin', 'dispatcher')
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    await this.visitsService.delete(id);
    return { deleted: true };
  }
}
