import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TenantSubscription } from './entities/tenant-subscription.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { StripeService } from './stripe.service';
import { EntitlementsService } from './entitlements.service';

/**
 * Owns the subscription LIFECYCLE (the write side that creates Stripe objects),
 * complementing BillingService (which consumes Stripe webhook events):
 *   • startTrial      — open a 14-day reverse trial on signup (no card)
 *   • createCheckout  — hosted Checkout to add a card and convert to paid
 *   • createPortal    — Billing Portal for self-serve manage/cancel
 *   • expireTrials    — daily cron: trials that lapsed without converting →
 *                       auto-downgrade to the free Starter plan (capped)
 */
@Injectable()
export class SubscriptionLifecycleService {
  private readonly logger = new Logger(SubscriptionLifecycleService.name);

  constructor(
    @InjectRepository(TenantSubscription, 'cacheDb')
    private readonly subRepo: Repository<TenantSubscription>,
    @InjectRepository(SubscriptionPlan, 'cacheDb')
    private readonly planRepo: Repository<SubscriptionPlan>,
    private readonly stripe: StripeService,
    private readonly entitlements: EntitlementsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Begin a reverse trial for a tenant. Idempotent: if a subscription row
   * already exists (trial already started, or a paying tenant), it is a no-op —
   * so this is safe to call on every owner signup.
   */
  async startTrial(tenantId: string): Promise<TenantSubscription> {
    const existing = await this.subRepo.findOne({ where: { tenantId } });
    if (existing) return existing;

    const trialDays = this.config.get<number>('stripe.trialDays') ?? 14;
    const planCode = this.config.get<string>('stripe.trialPlan') || 'growth';
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    const row = this.subRepo.create({
      tenantId,
      planCode,
      status: 'trialing',
      trialEndsAt,
    });
    await this.subRepo.save(row);
    this.logger.log(`trial started tenant=${tenantId} plan=${planCode} ends=${trialEndsAt.toISOString()}`);
    return row;
  }

  /**
   * Create a Checkout Session to add a card and subscribe to `planCode`.
   * Lazily creates+persists the tenant's Stripe customer. Seat quantity defaults
   * to the tenant's current active-driver count (min 1). Returns the hosted URL.
   */
  async createCheckout(
    tenantId: string,
    planCode: string,
    successUrl?: string,
    cancelUrl?: string,
  ): Promise<{ url: string }> {
    const plan = await this.planRepo.findOne({ where: { code: planCode } });
    if (!plan) {
      throw new BadRequestException({ errorCode: 'subscriptions.planNotFound', args: { plan: planCode } });
    }
    if (!plan.stripePriceId) {
      throw new BadRequestException({ errorCode: 'subscriptions.planNotPurchasable', args: { plan: planCode } });
    }

    const sub = await this.ensureRow(tenantId);
    const customerId = await this.ensureCustomer(sub);
    const { activeDrivers } = await this.entitlements.getEntitlements(tenantId);

    const url = await this.stripe.createCheckoutSession({
      customerId,
      priceId: plan.stripePriceId,
      quantity: activeDrivers,
      tenantId,
      successUrl: successUrl || this.config.get<string>('stripe.checkoutSuccessUrl')!,
      cancelUrl: cancelUrl || this.config.get<string>('stripe.checkoutCancelUrl')!,
    });
    this.logger.log(`checkout session created tenant=${tenantId} plan=${planCode} seats=${activeDrivers}`);
    return { url };
  }

  /** Create a Billing Portal session. Requires an existing Stripe customer. */
  async createPortal(tenantId: string, returnUrl?: string): Promise<{ url: string }> {
    const sub = await this.subRepo.findOne({ where: { tenantId } });
    if (!sub?.stripeCustomerId) {
      throw new BadRequestException({ errorCode: 'subscriptions.noBillingCustomer' });
    }
    const url = await this.stripe.createBillingPortalSession(
      sub.stripeCustomerId,
      returnUrl || this.config.get<string>('stripe.portalReturnUrl')!,
    );
    return { url };
  }

  /**
   * Daily: trials that lapsed without converting (still `trialing`, past their
   * end, and never linked to a Stripe subscription) drop to the free Starter
   * plan — which re-caps drivers at 3 via the seat gate. Idempotent.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async expireTrials(): Promise<void> {
    const result = await this.subRepo
      .createQueryBuilder()
      .update(TenantSubscription)
      .set({ status: 'free', planCode: 'starter' })
      .where('status = :status', { status: 'trialing' })
      .andWhere('trial_ends_at < NOW()')
      .andWhere('stripe_subscription_id IS NULL')
      .execute();
    if (result.affected) {
      this.logger.log(`expired ${result.affected} lapsed trial(s) → downgraded to starter`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  /** Get the tenant's subscription row, creating a bare one if absent. */
  private async ensureRow(tenantId: string): Promise<TenantSubscription> {
    const existing = await this.subRepo.findOne({ where: { tenantId } });
    if (existing) return existing;
    return this.subRepo.save(this.subRepo.create({ tenantId, planCode: 'starter' }));
  }

  /** Ensure the tenant has a Stripe customer id, creating + persisting one. */
  private async ensureCustomer(sub: TenantSubscription): Promise<string> {
    if (sub.stripeCustomerId) return sub.stripeCustomerId;
    const customerId = await this.stripe.createCustomer(sub.tenantId);
    sub.stripeCustomerId = customerId;
    await this.subRepo.save(sub);
    return customerId;
  }
}
