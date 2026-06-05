import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderWriteResult } from './order-writer.interface';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.orders.getAllByTenant(user.tenantId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.orders.findById(user.tenantId, Number(id));
  }

  @Roles('admin', 'dispatcher')
  @Post()
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateOrderDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orders.create(user.tenantId, dto);
    return this.shape(result, res, HttpStatus.CREATED);
  }

  @Roles('admin', 'dispatcher')
  @Patch(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orders.update(user.tenantId, Number(id), dto);
    return this.shape(result, res, HttpStatus.OK);
  }

  /** 201/200 with the row for sync (standalone); 202 + correlationId for async (integrated). */
  private shape(result: OrderWriteResult, res: Response, syncStatus: number) {
    if (result.mode === 'async') {
      res.status(HttpStatus.ACCEPTED);
      return { status: 'accepted', correlationId: result.correlationId };
    }
    res.status(syncStatus);
    return result.order;
  }
}
