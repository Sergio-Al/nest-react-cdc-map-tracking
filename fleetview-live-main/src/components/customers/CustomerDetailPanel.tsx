import { useMemo, useState } from 'react';
import { Pencil, PowerOff, Phone, Mail, MapPin, Calendar, Clock } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { DirectoryDetailPanel, type DirectoryDetailTab } from '@/components/ui/directory-detail-panel';
import { LocationPickerMap } from '@/components/ui/location-picker-map';
import { useVisitCompletions } from '@/hooks/api/useHistory';
import { useDrivers } from '@/hooks/api/useDrivers';
import { CATEGORY_META } from '@/lib/mock/customerMeta';
import { useDateLocale } from '@/i18n/useDateLocale';
import { cn } from '@/lib/utils';
import type { CustomerDirectoryRow } from '@/components/reports/reportFilters';

type Tab = 'overview' | 'visits';

interface Props {
  customer: CustomerDirectoryRow | null;
  onClose: () => void;
}

export function CustomerDetailPanel({ customer, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const { t } = useTranslation('customers');
  const dateLocale = useDateLocale();

  const lastVisitLabel = (days: number): string => {
    if (days <= 0) return t('lastVisitLabel.today');
    if (days >= 7) return t('lastVisitLabel.weeks', { count: Math.round(days / 7) });
    return t('lastVisitLabel.days', { count: days });
  };

  // Last-30-days range, hard-coded — intentionally not coupled to useReportsStore.
  const range = useMemo(() => {
    const to = new Date();
    const from = subDays(to, 30);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const { data: allVisits = [] } = useVisitCompletions(range.from, range.to);
  const { data: drivers = [] } = useDrivers();
  const driverName = useMemo(() => new Map(drivers.map((d) => [d.id, d.name])), [drivers]);

  const visits = useMemo(
    () => (customer ? allVisits.filter((v) => v.customerId === customer.id) : []),
    [allVisits, customer],
  );

  if (!customer) {
    return (
      <DirectoryDetailPanel
        isEmpty
        emptyTitle={t('detail.empty.title')}
        emptySubtitle={t('detail.empty.subtitle')}
      />
    );
  }

  const cat = CATEGORY_META[customer.category];
  const CatIcon = cat.icon;
  const isPremium = customer.customerType === 'premium';
  const categoryLabel = t(`categories.${customer.category}`, { defaultValue: cat.label });

  const tabs: DirectoryDetailTab[] = [
    { id: 'overview', label: t('detail.tabs.overview') },
    { id: 'visits', label: t('detail.tabs.visits'), count: visits.length },
  ];

  return (
    <DirectoryDetailPanel
      onClose={onClose}
      icon={
        <span
          className="inline-grid h-8 w-8 place-items-center rounded-full"
          style={{
            background: `color-mix(in oklch, ${cat.tint} 18%, transparent)`,
            color: cat.tint,
          }}
        >
          <CatIcon className="h-4 w-4" />
        </span>
      }
      title={customer.name}
      subtitle={`${categoryLabel} · ${customer.address ?? t('detail.subtitle.noAddress')}`}
      status={
        <span
          className={cn(
            'flex items-center gap-1 rounded-[5px] border px-[7px] py-[2px] font-mono text-[10.5px] font-medium',
            customer.active
              ? 'border-[oklch(0.72_0.16_150/0.35)] bg-[oklch(0.72_0.16_150/0.12)] text-[oklch(0.55_0.16_150)] dark:text-[oklch(0.85_0.18_150)]'
              : 'border-border bg-mc-surface text-mc-text-muted',
          )}
        >
          <span
            className="inline-block h-[5px] w-[5px] rounded-full"
            style={{ background: customer.active ? 'var(--mc-status-moving)' : 'var(--mc-text-dim)' }}
          />
          {t(`detail.statusBadge.${customer.active ? 'active' : 'inactive'}`)}
        </span>
      }
      actions={
        <>
          <button
            type="button"
            disabled
            title={t('detail.actions.notAvailable')}
            className="flex h-8 cursor-not-allowed items-center gap-[6px] rounded-mc border border-border bg-mc-elev px-3 text-[12px] font-medium text-mc-text-dim"
          >
            <Pencil className="h-[13px] w-[13px]" />
            <span>{t('detail.actions.edit')}</span>
          </button>
          <button
            type="button"
            disabled
            title={t('detail.actions.notAvailable')}
            className="flex h-8 cursor-not-allowed items-center gap-[6px] rounded-mc border border-border bg-mc-elev px-3 text-[12px] font-medium text-mc-text-dim"
          >
            <PowerOff className="h-[13px] w-[13px]" />
            <span>{t(`detail.actions.${customer.active ? 'deactivate' : 'activate'}`)}</span>
          </button>
        </>
      }
      tabs={tabs}
      activeTabId={activeTab}
      onTabChange={(id) => setActiveTab(id as Tab)}
    >
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-0">
          {/* Map preview */}
          <div className="border-b border-border px-4 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
              {t('detail.sections.location')}
            </div>
            {customer.latitude != null && customer.longitude != null ? (
              <LocationPickerMap
                lat={customer.latitude}
                lng={customer.longitude}
                radiusMeters={customer.geofenceRadiusMeters}
                height={180}
              />
            ) : (
              <div className="grid h-[180px] place-items-center rounded-[8px] border border-dashed border-border bg-mc-surface text-[11.5px] text-mc-text-muted">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {t('detail.sections.noCoordinates')}
                </span>
              </div>
            )}
            {customer.latitude != null && customer.longitude != null && (
              <div className="mt-2 flex items-center justify-between font-mono text-[10.5px] text-mc-text-dim">
                <span>
                  {customer.latitude.toFixed(4)}, {customer.longitude.toFixed(4)}
                </span>
                <span>{t('detail.sections.geofence', { value: customer.geofenceRadiusMeters })}</span>
              </div>
            )}
          </div>

          {/* Contact */}
          <div className="border-b border-border px-4 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
              {t('detail.sections.contact')}
            </div>
            <div className="flex flex-col gap-2 text-[12px]">
              <ContactRow icon={<Phone className="h-3.5 w-3.5" />} value={customer.phone} />
              <ContactRow icon={<Mail className="h-3.5 w-3.5" />} value={customer.email} />
              <ContactRow icon={<MapPin className="h-3.5 w-3.5" />} value={customer.address} />
            </div>
          </div>

          {/* Meta */}
          <div className="px-4 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
              {t('detail.sections.activity')}{' '}
              <span className="ml-1 font-mono text-[9.5px] font-normal normal-case tracking-normal text-mc-text-dim">
                {t('detail.sections.derived')}
              </span>
            </div>
            <div className="overflow-hidden rounded-[8px] border border-border bg-mc-elev">
              <MetaRow
                label={t('detail.sections.type')}
                value={
                  <span
                    className={cn(
                      'inline-flex rounded px-1.5 py-px font-mono text-[10.5px]',
                      isPremium ? 'bg-mc-accent-soft text-mc-accent' : 'bg-mc-surface text-mc-text-muted',
                    )}
                  >
                    {t(`customerType.${customer.customerType}`, { defaultValue: customer.customerType })}
                  </span>
                }
              />
              <MetaRow
                label={t('detail.sections.lastVisit')}
                value={
                  <span className="inline-flex items-center gap-1 font-mono text-[11.5px] text-foreground">
                    <Clock className="h-3 w-3 text-mc-text-dim" />
                    {lastVisitLabel(customer.lastVisitDays)}
                  </span>
                }
              />
              <MetaRow
                label={t('detail.sections.monthlyVisits')}
                value={
                  <span className="font-mono text-[11.5px] text-foreground">
                    {t('detail.sections.monthlyValue', { count: customer.monthlyFrequency })}
                  </span>
                }
                last
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'visits' && (
        <div className="flex flex-col gap-2 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            {t('detail.sections.last30Days')}
          </div>
          {visits.length === 0 ? (
            <div className="grid place-items-center gap-2 rounded-[8px] border border-dashed border-border bg-mc-surface px-4 py-6 text-center text-[11.5px] text-mc-text-muted">
              <Calendar className="h-4 w-4 text-mc-text-dim" />
              {t('detail.sections.noVisits')}
            </div>
          ) : (
            <div className="overflow-hidden rounded-[8px] border border-border bg-mc-elev">
              {visits.map((v, i) => (
                <div
                  key={`${v.visitId}-${i}`}
                  className={cn(
                    'flex items-start gap-2 px-3 py-[9px] text-[12px]',
                    i < visits.length - 1 && 'border-b border-border',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">
                      {driverName.get(v.driverId) ?? v.driverId.slice(0, 8)}
                    </div>
                    <div className="mt-px font-mono text-[10.5px] text-mc-text-dim">
                      {format(new Date(v.time), 'd MMM HH:mm', { locale: dateLocale })} ·{' '}
                      <span className="capitalize">{v.visitType}</span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'rounded px-1.5 py-px font-mono text-[10px]',
                      v.status === 'completed'
                        ? 'bg-[oklch(0.72_0.16_150/0.16)] text-[oklch(0.55_0.16_150)] dark:text-[oklch(0.85_0.18_150)]'
                        : v.status === 'failed'
                          ? 'bg-[oklch(0.65_0.18_25/0.18)] text-[oklch(0.55_0.18_25)] dark:text-[oklch(0.78_0.18_25)]'
                          : 'bg-mc-surface text-mc-text-muted',
                    )}
                  >
                    {t(`detail.visitStatus.${v.status}`, { defaultValue: v.status })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </DirectoryDetailPanel>
  );
}

function ContactRow({ icon, value }: { icon: React.ReactNode; value: string | null }) {
  if (!value) {
    return (
      <span className="flex items-center gap-2 text-mc-text-dim">
        <span className="shrink-0">{icon}</span>
        <span className="text-[11.5px]">—</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-foreground">
      <span className="shrink-0 text-mc-text-dim">{icon}</span>
      <span className="truncate font-mono text-[11.5px]">{value}</span>
    </span>
  );
}

function MetaRow({
  label,
  value,
  last,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-[9px]',
        !last && 'border-b border-border',
      )}
    >
      <span className="text-[11.5px] text-mc-text-muted">{label}</span>
      {value}
    </div>
  );
}
