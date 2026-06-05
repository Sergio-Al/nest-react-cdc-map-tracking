import { Controller, Get } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller()
export class SubscriptionsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  /** Frontend feature-flag source: what the current tenant is entitled to. */
  @Get('me/entitlements')
  getMine(@CurrentUser() user: any) {
    return this.entitlements.getEntitlements(user.tenantId);
  }

  /** Admin view of the tenant's resolved plan + seat usage. */
  @Roles('admin')
  @Get('tenant/subscription')
  getTenant(@CurrentUser() user: any) {
    return this.entitlements.getEntitlements(user.tenantId);
  }
}
