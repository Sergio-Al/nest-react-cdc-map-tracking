import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CustomerCacheService } from './customer-cache.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customerCache: CustomerCacheService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.customerCache.getAllByTenant(user.tenantId);
  }

  @Roles('admin', 'dispatcher')
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(@Body() dto: CreateCustomerDto) {
    const correlationId = randomUUID();
    await this.kafkaProducer.produce('commands.customers', {
      key: dto.tenantId,
      value: JSON.stringify({ op: 'create', correlationId, data: dto }),
    });
    return { status: 'accepted', correlationId };
  }
}

