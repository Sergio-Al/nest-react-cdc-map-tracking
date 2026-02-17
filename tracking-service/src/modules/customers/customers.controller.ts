import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CustomerCacheService } from './customer-cache.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customerCache: CustomerCacheService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.customerCache.getAllByTenant(user.tenantId);
  }
}
