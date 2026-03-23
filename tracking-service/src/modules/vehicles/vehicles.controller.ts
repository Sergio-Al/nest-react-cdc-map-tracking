import {
  Controller, Get, Post, Patch, Param, Body,
  Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Roles('admin', 'dispatcher')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateVehicleDto, @CurrentUser() user: any) {
    dto.tenantId = user.tenantId;  // enforce tenant from JWT
    return this.vehiclesService.create(dto);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.vehiclesService.findAll(user.tenantId);
  }

  @Get('search')
  search(
    @CurrentUser() user: any,
    @Query('plate')    plate?: string,
    @Query('type')     type?: string,
    @Query('status')   status?: string,
    @Query('driverId') driverId?: string,
    @Query('brand')    brand?: string,
  ) {
    return this.vehiclesService.search(user.tenantId, { plate, type, status, driverId, brand });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Roles('admin', 'dispatcher')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(id, dto);
  }
}
