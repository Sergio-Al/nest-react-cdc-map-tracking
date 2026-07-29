import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Headers,
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
    dto.tenantId = user.tenantId; // enforce tenant from JWT
    return this.visitsService.create(dto);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.visitsService.findById(id, user.tenantId);
  }

  @Get('route/:routeId')
  findByRoute(@Param('routeId', ParseUUIDPipe) routeId: string, @CurrentUser() user: any) {
    return this.visitsService.findByRoute(routeId, user.tenantId);
  }

  @Get('driver/:driverId')
  findByDriver(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query('date') date: string | undefined,
    @CurrentUser() user: any,
  ) {
    // Drivers can only see their own visits
    if (user.role === 'driver' && user.driverId !== driverId) {
      throw new ForbiddenException({ errorCode: 'visits.cannotAccessOtherDriver' });
    }
    return this.visitsService.findByDriver(driverId, date);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisitStatusDto,
    @CurrentUser() user: any,
    // Optional client-generated key from the driver app's offline outbox; used
    // for tracing replayed commands (idempotency itself is enforced by the
    // visit's status in the service — see VisitsService.updateStatus).
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    // If user is a driver, verify they own this visit
    if (user.role === 'driver') {
      const visit = await this.visitsService.findById(id, user.tenantId);
      const route = await this.visitsService['routesService'].findById(visit.routeId, user.tenantId);
      if (route.driverId !== user.driverId) {
        throw new ForbiddenException({ errorCode: 'visits.cannotUpdateOtherDriver' });
      }
    }
    return this.visitsService.updateStatus(id, dto, user.tenantId, idempotencyKey);
  }

  @Roles('admin', 'dispatcher')
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    await this.visitsService.delete(id, user.tenantId);
    return { deleted: true };
  }
}
