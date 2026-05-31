import { useMemo, useState } from 'react';
import { Plus, Building2, Clock, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useCustomers, useCreateCustomer } from '@/hooks/api/useRouteBuilder';
import { useAuthStore } from '@/stores/auth.store';
import { useSocket } from '@/hooks/useSocket';
import { CreateCustomerDialog } from '@/components/customers/CreateCustomerDialog';
import { CustomerDetailPanel } from '@/components/customers/CustomerDetailPanel';
import { Footer } from '@/components/dashboard/Footer';
import { FilterBar, useDatasetFilters } from '@/components/filters';
import { TableShell, Td } from '@/components/ui/table-shell';
import { getCustomerMeta, CATEGORY_META } from '@/lib/mock/customerMeta';
import {
  CUSTOMER_DIRECTORY_FIELDS,
  CUSTOMER_DIRECTORY_VIEWS,
  type CustomerDirectoryRow,
} from '@/components/reports/reportFilters';
import { cn } from '@/lib/utils';
import type { CreateCustomerDto } from '@/hooks/api/useRouteBuilder';

export default function CustomersPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pendingNames, setPendingNames] = useState<string[]>([]);

  const user = useAuthStore((s) => s.user);
  const { isConnected } = useSocket();
  const { data: customers = [], isLoading } = useCustomers();
  const createCustomer = useCreateCustomer();
  const { t } = useTranslation('customers');

  const lastVisitLabel = (days: number): string => {
    if (days <= 0) return t('lastVisitLabel.today');
    if (days >= 7) return t('lastVisitLabel.weeks', { count: Math.round(days / 7) });
    return t('lastVisitLabel.days', { count: days });
  };

  const isManager = user?.role === 'admin' || user?.role === 'dispatcher';

  const rows = useMemo<CustomerDirectoryRow[]>(
    () =>
      customers.map((c) => {
        const meta = getCustomerMeta(c);
        return {
          ...c,
          category: meta.category,
          lastVisitDays: meta.lastVisitDays,
          monthlyFrequency: meta.monthlyFrequency,
        };
      }),
    [customers],
  );

  // NOTE: '-page' suffix is required — must not collide with the Reports
  // Customers tab's 'customers' localStorage key (different fields/views).
  const ds = useDatasetFilters(
    'customers-page',
    rows,
    CUSTOMER_DIRECTORY_FIELDS,
    CUSTOMER_DIRECTORY_VIEWS,
  );

  const selected = useMemo(
    () => ds.filtered.find((c) => c.id === selectedId) ?? null,
    [ds.filtered, selectedId],
  );

  const handleCreate = async (dto: CreateCustomerDto) => {
    try {
      await createCustomer.mutateAsync(dto);
      setPendingNames((prev) => [...prev, dto.name]);
      setTimeout(() => {
        setPendingNames((prev) => prev.filter((n) => n !== dto.name));
      }, 5000);
      toast.success(t('toasts.queued', { name: dto.name }), {
        duration: 5000,
      });
    } catch {
      toast.error(t('toasts.createFailed'));
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-mc-accent-border bg-mc-accent-soft text-mc-accent">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[18px] font-semibold tracking-[-0.02em] text-foreground">
              {t('page.title')}
            </div>
            <div className="mt-0.5 text-xs text-mc-text-muted">
              {t('page.subtitle', { count: customers.length })}
            </div>
          </div>
          {isManager && (
            <div className="ml-auto">
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="flex h-8 items-center gap-[6px] rounded-mc bg-mc-accent px-3 text-[12.5px] font-medium text-white hover:bg-mc-accent-strong"
              >
                <Plus className="h-[13px] w-[13px]" />
                <span>{t('page.newCustomer')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CDC pending banner */}
      {pendingNames.length > 0 && (
        <div className="flex items-center gap-2 border-b border-[oklch(0.78_0.14_80/0.25)] bg-[oklch(0.78_0.14_80/0.10)] px-6 py-2 text-[11.5px] text-[oklch(0.5_0.14_80)] dark:text-[oklch(0.85_0.16_80)]">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span
            dangerouslySetInnerHTML={{
              __html: t('banner.syncing', { names: pendingNames.join(', ') }),
            }}
          />
        </div>
      )}

      {/* Filter bar */}
      <FilterBar
        fields={CUSTOMER_DIRECTORY_FIELDS}
        rows={rows}
        filters={ds.filters}
        onChange={ds.updateFilters}
        views={ds.views}
        activeViewId={ds.activeViewId}
        onSelectView={ds.selectView}
        onSaveView={ds.saveView}
        onDeleteView={ds.deleteView}
        isMock
      />

      {/* Body: table + detail */}
      <div className="flex min-h-0 flex-1">
        <TableShell
          headers={[
            { label: t('table.customer') },
            { label: t('table.category') },
            { label: t('table.type') },
            { label: t('table.contact') },
            { label: t('table.geofence'), num: true },
            { label: t('table.lastVisit') },
            { label: t('table.status') },
          ]}
          count={ds.filtered.length}
          isLoading={isLoading}
          emptyMessage={t('table.empty')}
        >
          {ds.filtered.map((c) => {
            const cat = CATEGORY_META[c.category];
            const CatIcon = cat.icon;
            const isSelected = c.id === selectedId;
            const isPremium = c.customerType === 'premium';
            return (
              <tr
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-mc-surface',
                  isSelected && 'bg-mc-accent-soft/40',
                )}
              >
                <Td>
                  <div className="font-medium text-foreground">{c.name}</div>
                  {c.address && (
                    <div className="mt-px max-w-[220px] truncate text-[11px] text-mc-text-muted">
                      {c.address}
                    </div>
                  )}
                </Td>
                <Td>
                  <span
                    className="inline-flex items-center gap-1.5 rounded px-1.5 py-px text-[11px]"
                    style={{
                      background: `color-mix(in oklch, ${cat.tint} 14%, transparent)`,
                      color: cat.tint,
                    }}
                  >
                    <CatIcon className="h-3 w-3" />
                    {t(`categories.${c.category}`, { defaultValue: cat.label })}
                  </span>
                </Td>
                <Td>
                  <span
                    className={cn(
                      'inline-flex rounded px-1.5 py-px font-mono text-[10.5px]',
                      isPremium
                        ? 'bg-mc-accent-soft text-mc-accent'
                        : 'bg-mc-surface text-mc-text-muted',
                    )}
                  >
                    {t(`customerType.${c.customerType}`, { defaultValue: c.customerType })}
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-col gap-0.5">
                    {c.phone && (
                      <span className="flex items-center gap-1 font-mono text-[11px] text-mc-text-muted">
                        <Phone className="h-3 w-3" />
                        {c.phone}
                      </span>
                    )}
                    {c.email && (
                      <span className="flex items-center gap-1 font-mono text-[11px] text-mc-text-muted">
                        <Mail className="h-3 w-3" />
                        {c.email}
                      </span>
                    )}
                    {!c.phone && !c.email && <span className="text-mc-text-dim">—</span>}
                  </div>
                </Td>
                <Td num>{c.geofenceRadiusMeters} m</Td>
                <Td>
                  <span className="font-mono text-[11.5px] text-foreground">
                    {lastVisitLabel(c.lastVisitDays)}
                  </span>
                </Td>
                <Td>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-[7px] py-[1px] font-mono text-[10.5px] font-semibold',
                      c.active
                        ? 'bg-[oklch(0.72_0.16_150/0.16)] text-[oklch(0.45_0.16_150)] dark:text-[oklch(0.85_0.18_150)]'
                        : 'bg-mc-surface text-mc-text-muted',
                    )}
                  >
                    <span className="h-[5px] w-[5px] rounded-full bg-current" />
                    {t(`status.${c.active ? 'active' : 'inactive'}`)}
                  </span>
                </Td>
              </tr>
            );
          })}
        </TableShell>

        <CustomerDetailPanel customer={selected} onClose={() => setSelectedId(null)} />
      </div>

      <Footer isConnected={isConnected} />

      <CreateCustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tenantId={user?.tenantId ?? ''}
        onSubmit={handleCreate}
        isLoading={createCustomer.isPending}
      />
    </div>
  );
}
