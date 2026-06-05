import { Injectable, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { TenantSubscription } from './entities/tenant-subscription.entity';
import { Driver } from '../drivers/entities/driver.entity';

/** Fully-resolved entitlements the app/guards consume. */
export interface Entitlements {
  planCode: string;
  planName: string;
  pricePerSeatCents: number;
  status: string;
  features: string[];
  maxDrivers: number | null; // effective seat cap (NULL = unlimited)
  activeDrivers: number;
  seatsPurchased: number | null;
  trialEndsAt: string | null; // ISO; for the trial countdown
  currentPeriodEnd: string | null; // ISO; next renewal
  integrationAllowed: boolean;
  integrationMode: 'standalone' | 'integrated';
  integrationStatus: string;
}

/** One entry in the public plan catalog (for the pricing/upgrade UI). */
export interface PlanCatalogEntry {
  code: string;
  name: string;
  pricePerSeatCents: number;
  maxDrivers: number | null;
  integrationAllowed: boolean;
  features: string[];
  purchasable: boolean; // has a Stripe price mapped
}

/**
 * Resolves a tenant's plan + subscription into concrete entitlements and gates:
 *   • driver-create        → assertCanAddDriver (402 over seat cap)
 *   • feature routes       → assertFeature / hasFeature (used by FeatureGuard)
 *   • turning integration on → assertCanIntegrate (only if plan allows it)
 *
 * A tenant with NO subscription row resolves to the free Starter defaults — a
 * just-signed-up standalone tenant must work before any billing row exists.
 */
@Injectable()
export class EntitlementsService {
  // Fallback when a tenant has no subscription row yet (pre-billing self-serve).
  private static readonly FREE_DEFAULTS = {
    planCode: 'starter',
    planName: 'Starter',
    pricePerSeatCents: 0,
    status: 'free',
    features: ['playback'] as string[],
    maxDrivers: 3 as number | null,
    seatsPurchased: null as number | null,
    trialEndsAt: null as string | null,
    currentPeriodEnd: null as string | null,
    integrationAllowed: false,
    integrationMode: 'standalone' as const,
    integrationStatus: 'disconnected',
  };

  constructor(
    @InjectRepository(SubscriptionPlan, 'cacheDb')
    private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(TenantSubscription, 'cacheDb')
    private readonly subRepo: Repository<TenantSubscription>,
    @InjectRepository(Driver, 'cacheDb')
    private readonly driverRepo: Repository<Driver>,
  ) {}

  async getEntitlements(tenantId: string): Promise<Entitlements> {
    const sub = await this.subRepo.findOne({ where: { tenantId } });
    const plan = sub ? await this.planRepo.findOne({ where: { code: sub.planCode } }) : null;
    const activeDrivers = await this.countActiveDrivers(tenantId);

    if (!sub || !plan) {
      const d = EntitlementsService.FREE_DEFAULTS;
      return { ...d, activeDrivers };
    }

    // Effective cap: explicit seats override the plan's bundled max; NULL on both = unlimited.
    const maxDrivers = sub.seatsPurchased ?? plan.maxDrivers ?? null;
    return {
      planCode: plan.code,
      planName: plan.name,
      pricePerSeatCents: plan.pricePerSeatCents,
      status: sub.status,
      features: plan.features ?? [],
      maxDrivers,
      activeDrivers,
      seatsPurchased: sub.seatsPurchased ?? null,
      trialEndsAt: sub.trialEndsAt ? sub.trialEndsAt.toISOString() : null,
      currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
      integrationAllowed: plan.integrationAllowed,
      integrationMode: sub.integrationMode === 'integrated' ? 'integrated' : 'standalone',
      integrationStatus: sub.integrationStatus,
    };
  }

  /** Public plan catalog for the pricing/upgrade UI, cheapest first. */
  async listPlans(): Promise<PlanCatalogEntry[]> {
    const plans = await this.planRepo.find({
      where: { isPublic: true },
      order: { sortOrder: 'ASC' },
    });
    return plans.map((p) => ({
      code: p.code,
      name: p.name,
      pricePerSeatCents: p.pricePerSeatCents,
      maxDrivers: p.maxDrivers,
      integrationAllowed: p.integrationAllowed,
      features: p.features ?? [],
      // Only price-mapped plans can actually be checked out.
      purchasable: !!p.stripePriceId,
    }));
  }

  /** A seat = one active (non-inactive) driver. Soft-delete sets status='inactive'. */
  private countActiveDrivers(tenantId: string): Promise<number> {
    return this.driverRepo.count({ where: { tenantId, status: Not('inactive') } });
  }

  // ── Feature gating ────────────────────────────────────────
  async hasFeature(tenantId: string, feature: string): Promise<boolean> {
    const { features } = await this.getEntitlements(tenantId);
    return features.includes(feature);
  }

  async assertFeature(tenantId: string, feature: string): Promise<void> {
    if (!(await this.hasFeature(tenantId, feature))) {
      throw new ForbiddenException({
        errorCode: 'subscriptions.featureNotInPlan',
        args: { feature },
      });
    }
  }

  // ── Seat gating ───────────────────────────────────────────
  /** Throws 402 Payment Required when the tenant is at/over its seat cap. */
  async assertCanAddDriver(tenantId: string): Promise<void> {
    const { maxDrivers, activeDrivers } = await this.getEntitlements(tenantId);
    if (maxDrivers != null && activeDrivers >= maxDrivers) {
      throw new HttpException(
        { errorCode: 'subscriptions.seatLimitReached', args: { limit: maxDrivers } },
        HttpStatus.PAYMENT_REQUIRED, // 402
      );
    }
  }

  // ── Integration upsell gating ─────────────────────────────
  async canIntegrate(tenantId: string): Promise<boolean> {
    return (await this.getEntitlements(tenantId)).integrationAllowed;
  }

  /** Gate flipping a tenant to integrated mode / POST /api/integration/connect. */
  async assertCanIntegrate(tenantId: string): Promise<void> {
    if (!(await this.canIntegrate(tenantId))) {
      throw new ForbiddenException({ errorCode: 'subscriptions.integrationNotAllowed' });
    }
  }
}
