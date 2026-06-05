import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { TenantSubscription } from './entities/tenant-subscription.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { EntitlementsService } from './entitlements.service';
import { FeatureGuard } from './guards/feature.guard';
import { SubscriptionsController } from './subscriptions.controller';
import { StripeService } from './stripe.service';
import { BillingService } from './billing.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { WebhookController } from './webhook.controller';

/**
 * SaaS control plane: plan catalog + per-tenant subscription, and the
 * EntitlementsService that gates seats / features / the integration upsell.
 * PG-owned (like settings) so a standalone tenant works with no Kafka/CDC.
 *
 * Registers Driver here (read-only, for the active-seat count) — a separate
 * forFeature registration from DriversModule, which is fine in TypeORM.
 * Exports EntitlementsService + FeatureGuard so other modules can enforce:
 *   import SubscriptionsModule, then @UseGuards(FeatureGuard) + @RequiresFeature(...)
 *   or inject EntitlementsService for seat / integration gates.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SubscriptionPlan, TenantSubscription, Driver], 'cacheDb'),
  ],
  controllers: [SubscriptionsController, WebhookController],
  providers: [
    EntitlementsService,
    FeatureGuard,
    StripeService,
    BillingService,
    SubscriptionLifecycleService,
  ],
  exports: [EntitlementsService, FeatureGuard, SubscriptionLifecycleService],
})
export class SubscriptionsModule {}
