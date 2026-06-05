import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CreditCard, AlertTriangle, CheckCircle2, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useEntitlements,
  usePlans,
  useCheckout,
  usePortal,
  useStartTrial,
  type Entitlements,
  type SubscriptionPlan,
} from '@/hooks/api/useEntitlements';

// ── helpers ──────────────────────────────────────────────────

function daysUntil(isoDate: string): number {
  const now = Date.now();
  const end = new Date(isoDate).getTime();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}

function formatDate(isoDate: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

function formatCurrency(cents: number, locale: string): string {
  const dollars = cents / 100;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(dollars);
  } catch {
    return `$${dollars}`;
  }
}

// ── sub-components ────────────────────────────────────────────

function StatusBadge({ status }: { status: Entitlements['status'] }) {
  const { t } = useTranslation('billing');
  const classes: Record<Entitlements['status'], string> = {
    trialing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    active: 'bg-green-500/10 text-green-400 border-green-500/20',
    past_due: 'bg-red-500/10 text-red-400 border-red-500/20',
    canceled: 'bg-mc-text-dim/10 text-mc-text-dim border-mc-border',
    free: 'bg-mc-text-muted/10 text-mc-text-muted border-mc-border',
  };
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em]',
      classes[status],
    )}>
      {t(`status.${status}`)}
    </span>
  );
}

function StateBanner({ ent }: { ent: Entitlements }) {
  const { t, i18n } = useTranslation('billing');
  const checkout = useCheckout();
  const portal = usePortal();

  if (ent.status === 'trialing' && ent.trialEndsAt) {
    const days = daysUntil(ent.trialEndsAt);
    const label = days === 0 ? t('banner.trialingZero') : t('banner.trialing', { days });
    return (
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3.5 py-2.5">
        <Clock className="h-4 w-4 shrink-0 text-blue-400" />
        <span className="flex-1 text-[12.5px] text-mc-text">{label}</span>
        <button
          onClick={() => checkout.mutate(ent.planCode)}
          disabled={checkout.isPending}
          className="inline-flex h-7 shrink-0 items-center rounded-[7px] border border-mc-accent-strong bg-mc-accent px-3 text-xs font-medium text-mc-accent-fg shadow-[inset_0_1px_0_oklch(1_0_0_/_0.3)] transition-colors hover:bg-mc-accent-strong disabled:opacity-60"
        >
          {t('cta.addPayment')}
        </button>
      </div>
    );
  }

  if (ent.status === 'past_due') {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3.5 py-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
        <span className="flex-1 text-[12.5px] text-mc-text">{t('banner.pastDue')}</span>
        <button
          onClick={() => portal.mutate()}
          disabled={portal.isPending}
          className="inline-flex h-7 shrink-0 items-center rounded-[7px] border border-red-500/40 bg-red-500/10 px-3 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-60"
        >
          {t('cta.manageBilling')}
        </button>
      </div>
    );
  }

  if (ent.status === 'active' && ent.currentPeriodEnd) {
    const dateStr = formatDate(ent.currentPeriodEnd, i18n.language);
    return (
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 px-3.5 py-2.5">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
        <span className="flex-1 text-[12.5px] text-mc-text">{t('banner.active', { date: dateStr })}</span>
        <button
          onClick={() => portal.mutate()}
          disabled={portal.isPending}
          className="inline-flex h-7 shrink-0 items-center rounded-[7px] border border-mc-border bg-mc-surface px-3 text-xs font-medium text-mc-text transition-colors hover:border-mc-border-strong disabled:opacity-60"
        >
          {t('cta.manageBilling')}
        </button>
      </div>
    );
  }

  return null;
}

function SeatBar({ active, max }: { active: number; max: number | null }) {
  const { t } = useTranslation('billing');
  const pct = max !== null && max > 0 ? Math.min(100, Math.round((active / max) * 100)) : 0;
  const label = max === null
    ? t('seats.unlimited', { active })
    : t('seats.value', { active, max });
  const overloaded = max !== null && active > max;

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
        <span className="font-medium text-mc-text">{t('seats.label')}</span>
        <span className={cn('text-mc-text-muted', overloaded && 'text-red-400')}>{label}</span>
      </div>
      {max !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-mc-border">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              overloaded ? 'bg-red-500' : pct >= 85 ? 'bg-amber-400' : 'bg-mc-accent',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  ent,
}: {
  plan: SubscriptionPlan;
  isCurrent: boolean;
  ent: Entitlements;
}) {
  const { t, i18n } = useTranslation('billing');
  const checkout = useCheckout();

  const priceLabel = plan.pricePerSeatCents === 0
    ? t('plans.free')
    : t('plans.perSeatPerMonth', { price: formatCurrency(plan.pricePerSeatCents, i18n.language) });

  const driverLabel = plan.maxDrivers === null
    ? t('plans.unlimitedDrivers')
    : t('plans.drivers', { n: plan.maxDrivers });

  const handleChoose = () => {
    if (!isCurrent && plan.purchasable) {
      checkout.mutate(plan.code);
    }
  };

  return (
    <div className={cn(
      'flex flex-col gap-2.5 rounded-lg border p-4 transition-colors',
      isCurrent
        ? 'border-mc-accent-border bg-mc-accent/5'
        : 'border-mc-border bg-mc-surface hover:border-mc-border-strong',
    )}>
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold tracking-[-0.01em] text-mc-text">{plan.name}</div>
          <div className="mt-0.5 text-xs text-mc-text-muted">{priceLabel}</div>
        </div>
        {isCurrent && (
          <span className="shrink-0 rounded-full border border-mc-accent-border bg-mc-accent/10 px-2 py-0.5 text-[10.5px] font-semibold text-mc-accent-fg">
            {t('plans.current')}
          </span>
        )}
      </div>

      {/* driver cap */}
      <div className="text-[12px] text-mc-text-muted">{driverLabel}</div>

      {/* feature list */}
      {plan.features.length > 0 && (
        <ul className="space-y-0.5">
          {plan.features.map((f) => (
            <li key={f} className="flex items-center gap-1.5 text-[11.5px] text-mc-text-muted">
              <CheckCircle2 className="h-3 w-3 shrink-0 text-mc-accent" />
              {f}
            </li>
          ))}
        </ul>
      )}

      {/* CTA */}
      {!isCurrent && (
        <button
          onClick={handleChoose}
          disabled={isCurrent || !plan.purchasable || checkout.isPending}
          title={!plan.purchasable ? t('plans.comingSoon') : undefined}
          className={cn(
            'mt-auto inline-flex h-7 w-full items-center justify-center rounded-[7px] text-xs font-medium transition-colors',
            plan.purchasable
              ? 'border border-mc-accent-strong bg-mc-accent text-mc-accent-fg shadow-[inset_0_1px_0_oklch(1_0_0_/_0.3)] hover:bg-mc-accent-strong disabled:opacity-60'
              : 'border border-mc-border bg-mc-surface text-mc-text-dim cursor-not-allowed',
          )}
        >
          {plan.purchasable
            ? (ent.status === 'free' || ent.status === 'trialing' ? t('plans.choosePlan') : t('plans.upgrade'))
            : t('plans.comingSoon')}
        </button>
      )}
    </div>
  );
}

function ManageBillingButton({ ent }: { ent: Entitlements }) {
  const { t } = useTranslation('billing');
  const portal = usePortal();
  const hasBillingCustomer = ent.status === 'active' || ent.status === 'past_due' || ent.status === 'canceled';
  if (!hasBillingCustomer) return null;

  return (
    <button
      onClick={() => portal.mutate()}
      disabled={portal.isPending}
      className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-mc-border bg-mc-surface px-3 text-xs font-medium text-mc-text transition-colors hover:border-mc-border-strong disabled:opacity-60"
    >
      <CreditCard className="h-3.5 w-3.5" />
      {t('cta.manageBilling')}
    </button>
  );
}

function StartTrialButton({ ent }: { ent: Entitlements }) {
  const { t } = useTranslation('billing');
  const qc = useQueryClient();
  const startTrial = useStartTrial();

  if (ent.status !== 'free' || ent.trialEndsAt) return null;

  return (
    <button
      onClick={() => startTrial.mutate(undefined, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['entitlements', 'me'] }); },
      })}
      disabled={startTrial.isPending}
      className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-mc-accent-strong bg-mc-accent px-3 text-xs font-medium text-mc-accent-fg shadow-[inset_0_1px_0_oklch(1_0_0_/_0.3)] transition-colors hover:bg-mc-accent-strong disabled:opacity-60"
    >
      <Zap className="h-3.5 w-3.5" />
      {t('cta.startTrial')}
    </button>
  );
}

// ── main export ───────────────────────────────────────────────

export function BillingCard({
  cardTitle,
  cardDesc,
  cardClass,
}: {
  cardTitle: string;
  cardDesc: string;
  cardClass?: string;
}) {
  const { t } = useTranslation('billing');
  const { data: ent, isLoading: entLoading } = useEntitlements();
  const { data: plans, isLoading: plansLoading } = usePlans();

  const isLoading = entLoading || plansLoading;

  return (
    <section className={cn(
      'overflow-hidden rounded-[10px] border border-mc-border bg-mc-elev [&+&]:mt-4',
      cardClass,
    )}>
      {/* card header */}
      <div className="border-b border-mc-border px-[18px] pb-3.5 pt-4">
        <div className="text-sm font-semibold tracking-[-0.01em]">{cardTitle}</div>
        <div className="mt-[3px] text-[12.5px] text-mc-text-muted">{cardDesc}</div>
      </div>

      <div className="px-[18px] pb-4 pt-3">
        {isLoading && (
          <div className="flex items-center gap-2 py-4 text-[12.5px] text-mc-text-muted">
            <span className="h-1.5 w-1.5 animate-livepulse rounded-full bg-mc-text-muted" />
            Loading…
          </div>
        )}

        {!isLoading && ent && (
          <>
            {/* current plan row */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-[13px] font-semibold text-mc-text">{ent.planName}</span>
                <span className="ml-2">
                  <StatusBadge status={ent.status} />
                </span>
              </div>
              <div className="flex items-center gap-2">
                <StartTrialButton ent={ent} />
                <ManageBillingButton ent={ent} />
              </div>
            </div>

            {/* state banner */}
            <StateBanner ent={ent} />

            {/* seat usage */}
            <SeatBar active={ent.activeDrivers} max={ent.maxDrivers} />

            {/* plan picker */}
            {plans && plans.length > 0 && (
              <div className="mt-5">
                <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-mc-text-muted">
                  {t('plans.title')}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {plans.map((plan) => (
                    <PlanCard
                      key={plan.code}
                      plan={plan}
                      isCurrent={plan.code === ent.planCode}
                      ent={ent}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
