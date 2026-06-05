import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantSubscription } from './entities/tenant-subscription.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import type { StripeEvent } from './stripe.service';

// Resource types derived from the SDK's own event union (the named
// `Stripe.Checkout.Session` etc. aren't reachable under CommonJS resolution —
// see stripe.service.ts). Narrowing `StripeEvent` by `type` gives the exact
// `data.object` type per event.
type EventOf<T extends StripeEvent['type']> = Extract<StripeEvent, { type: T }>;
type CheckoutSession = EventOf<'checkout.session.completed'>['data']['object'];
type StripeSubscription = EventOf<'customer.subscription.created'>['data']['object'];
type StripeInvoice = EventOf<'invoice.paid'>['data']['object'];

/**
 * Applies Stripe webhook events to the local `tenant_subscriptions` projection.
 * State is synced by ABSOLUTE value (not increments), so redelivered events are
 * naturally idempotent. The tenant is resolved from `metadata.tenantId` (set at
 * checkout) or, failing that, by looking up the stored `stripe_customer_id`.
 * Unmappable events are logged and skipped (we still ACK 200 so Stripe stops
 * retrying). This does NOT touch `tenant_settings.ingest_mode` — a plan
 * downgrade revokes the integration *capability* (via the plan) but never
 * silently flips a tenant's live order write path.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(TenantSubscription, 'cacheDb')
    private readonly subRepo: Repository<TenantSubscription>,
    @InjectRepository(SubscriptionPlan, 'cacheDb')
    private readonly planRepo: Repository<SubscriptionPlan>,
  ) {}

  async applyEvent(event: StripeEvent): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.onSubscriptionUpsert(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.onInvoiceStatus(event.data.object, 'past_due');
        break;
      case 'invoice.paid':
        await this.onInvoiceStatus(event.data.object, 'active');
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }

  // ── Event handlers ────────────────────────────────────────
  /** Links a Stripe customer/subscription to a tenant after checkout. */
  private async onCheckoutCompleted(session: CheckoutSession): Promise<void> {
    const tenantId = session.metadata?.tenantId ?? session.client_reference_id ?? null;
    const customerId = this.idOf(session.customer);
    if (!tenantId) {
      this.logger.warn(`checkout.session.completed without tenantId (customer=${customerId}) — skipped`);
      return;
    }
    await this.upsert(tenantId, {
      stripeCustomerId: customerId,
      stripeSubscriptionId: this.idOf(session.subscription),
    });
    this.logger.log(`checkout linked tenant=${tenantId} → customer=${customerId}`);
  }

  /** Sync plan, status, seats and billing period from a subscription object. */
  private async onSubscriptionUpsert(sub: StripeSubscription): Promise<void> {
    const customerId = this.idOf(sub.customer);
    const tenantId = await this.resolveTenantId(sub.metadata, customerId);
    if (!tenantId) {
      this.logger.warn(`subscription ${sub.id} maps to no tenant (customer=${customerId}) — skipped`);
      return;
    }
    const item = sub.items?.data?.[0];
    const planCode = await this.planCodeForPrice(item?.price?.id);
    const patch: Partial<TenantSubscription> = {
      status: this.mapStatus(sub.status),
      seatsPurchased: item?.quantity ?? null,
      currentPeriodEnd: this.periodEnd(sub),
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
    };
    // Only overwrite plan_code when the price maps to a known plan.
    if (planCode) patch.planCode = planCode;
    await this.upsert(tenantId, patch);
    this.logger.log(
      `subscription synced tenant=${tenantId} plan=${planCode ?? '(unchanged)'} status=${patch.status}`,
    );
  }

  /** Subscription ended → mark canceled and drop to the free Starter plan. */
  private async onSubscriptionDeleted(sub: StripeSubscription): Promise<void> {
    const tenantId = await this.resolveTenantId(sub.metadata, this.idOf(sub.customer));
    if (!tenantId) return;
    await this.upsert(tenantId, {
      status: 'canceled',
      planCode: 'starter',
      integrationStatus: 'disconnected',
    });
    this.logger.log(`subscription canceled tenant=${tenantId} → downgraded to starter`);
  }

  /** Invoice paid/failed → flip the subscription status (no plan change). */
  private async onInvoiceStatus(invoice: StripeInvoice, status: string): Promise<void> {
    const tenantId = await this.resolveTenantId(null, this.idOf(invoice.customer));
    if (!tenantId) return;
    await this.upsert(tenantId, { status });
    this.logger.log(`invoice → tenant=${tenantId} status=${status}`);
  }

  // ── Helpers ───────────────────────────────────────────────
  private async upsert(tenantId: string, patch: Partial<TenantSubscription>): Promise<void> {
    const existing = await this.subRepo.findOne({ where: { tenantId } });
    const row = existing ?? this.subRepo.create({ tenantId, planCode: 'starter' });
    Object.assign(row, patch);
    await this.subRepo.save(row);
  }

  private async resolveTenantId(
    metadata: Record<string, string> | null | undefined,
    customerId: string | null,
  ): Promise<string | null> {
    if (metadata?.tenantId) return metadata.tenantId;
    if (customerId) {
      const row = await this.subRepo.findOne({ where: { stripeCustomerId: customerId } });
      if (row) return row.tenantId;
    }
    return null;
  }

  private async planCodeForPrice(priceId: string | undefined): Promise<string | null> {
    if (!priceId) return null;
    const plan = await this.planRepo.findOne({ where: { stripePriceId: priceId } });
    return plan?.code ?? null;
  }

  /** Map Stripe subscription.status onto our enum (trialing|active|past_due|canceled). */
  private mapStatus(s: StripeSubscription['status']): string {
    switch (s) {
      case 'trialing':
      case 'incomplete':
        return 'trialing';
      case 'active':
        return 'active';
      case 'past_due':
      case 'unpaid':
      case 'paused':
        return 'past_due';
      case 'canceled':
      case 'incomplete_expired':
        return 'canceled';
      default:
        return 'active';
    }
  }

  /**
   * Billing period end. Stripe moved this from the subscription to the line item
   * in API 2025-03-31+, so read whichever the SDK/account version exposes.
   */
  private periodEnd(sub: StripeSubscription): Date | null {
    const anySub = sub as unknown as {
      current_period_end?: number;
      items?: { data?: Array<{ current_period_end?: number }> };
    };
    const epoch = anySub.current_period_end ?? anySub.items?.data?.[0]?.current_period_end ?? null;
    return epoch ? new Date(epoch * 1000) : null;
  }

  /** Normalize a Stripe expandable field (string id | object | null) to its id. */
  private idOf(ref: string | { id: string } | null | undefined): string | null {
    if (!ref) return null;
    return typeof ref === 'string' ? ref : ref.id;
  }
}
