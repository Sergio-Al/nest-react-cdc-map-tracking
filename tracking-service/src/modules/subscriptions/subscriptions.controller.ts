import { Controller, Get, Post, Body } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreatePortalDto } from './dto/create-portal.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller()
export class SubscriptionsController {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

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

  /** Start (or no-op resume) the reverse trial for the current tenant. */
  @Roles('admin')
  @Post('subscriptions/trial/start')
  startTrial(@CurrentUser() user: any) {
    return this.lifecycle.startTrial(user.tenantId);
  }

  /** Begin Checkout to add a card and convert to a paid plan; returns the URL. */
  @Roles('admin')
  @Post('subscriptions/checkout')
  checkout(@CurrentUser() user: any, @Body() dto: CreateCheckoutDto) {
    return this.lifecycle.createCheckout(user.tenantId, dto.planCode, dto.successUrl, dto.cancelUrl);
  }

  /** Open the Stripe Billing Portal to manage/cancel the subscription. */
  @Roles('admin')
  @Post('subscriptions/portal')
  portal(@CurrentUser() user: any, @Body() dto: CreatePortalDto) {
    return this.lifecycle.createPortal(user.tenantId, dto.returnUrl);
  }
}
