import { Controller, Get, Post, Patch, Param, Body, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CustomerCacheService } from './customer-cache.service';
import { CustomerWriterResolver } from './customer-writer.resolver';
import { CustomerWriteResult } from './customer-writer.interface';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customerCache: CustomerCacheService,
    private readonly resolver: CustomerWriterResolver,
  ) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.customerCache.getAllByTenant(user.tenantId);
  }

  @Roles('admin', 'dispatcher')
  @Post()
  async create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    dto.tenantId = user.tenantId; // enforce tenant from JWT (never trust the body)
    const writer = await this.resolver.resolve(user.tenantId);
    const result = await writer.createCustomer(user.tenantId, dto);
    return this.shape(result, res, HttpStatus.CREATED);
  }

  @Roles('admin', 'dispatcher')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    dto.tenantId = user.tenantId;
    const writer = await this.resolver.resolve(user.tenantId);
    const result = await writer.updateCustomer(user.tenantId, Number(id), dto);
    return this.shape(result, res, HttpStatus.OK);
  }

  private shape(result: CustomerWriteResult, res: Response, syncStatus: number) {
    if (result.correlationId) res.setHeader('X-Correlation-Id', result.correlationId);
    if (result.mode === 'async') {
      res.status(HttpStatus.ACCEPTED);
      return { status: 'accepted', correlationId: result.correlationId };
    }
    res.status(syncStatus);
    return result.customer;
  }
}
