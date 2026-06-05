import { useMemo, useState } from 'react';
import { Plus, ShoppingCart, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOrders, useCreateOrder } from '@/hooks/api/useOrders';
import { useCustomers } from '@/hooks/api/useRouteBuilder';
import { useSettings } from '@/hooks/api/useSettings';
import { useAuthStore } from '@/stores/auth.store';
import { useSocket } from '@/hooks/useSocket';
import { CreateOrderDialog } from '@/components/orders/CreateOrderDialog';
import { OrderDetailPanel } from '@/components/orders/OrderDetailPanel';
import { Footer } from '@/components/dashboard/Footer';
import { FilterBar, useDatasetFilters } from '@/components/filters';
import { TableShell, Td } from '@/components/ui/table-shell';
import { cn } from '@/lib/utils';
import type { FieldDef, SavedView } from '@/components/filters/types';
import type { Order, CreateOrderDto } from '@/types/order.types';

/** Enriched row for filtering (adds customerName string). */
interface OrderRow extends Order {
  customerName: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

function uniqOptions<T>(
  rows: T[],
  valueFn: (r: T) => string | number | null | undefined,
  labelFn: (r: T) => string,
): { value: string; label: string }[] {
  const map = new Map<string, string>();
  for (const r of rows) {
    const v = valueFn(r);
    if (v == null || v === '') continue;
    const key = String(v);
    if (!map.has(key)) map.set(key, labelFn(r));
  }
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const ORDER_FIELDS: FieldDef<OrderRow>[] = [
  {
    id: 'status',
    label: 'Status',
    kind: 'enum',
    options: (rows) =>
      uniqOptions(rows, (r) => r.status, (r) => cap(r.status)),
    get: (r) => r.status,
  },
  {
    id: 'customer',
    label: 'Customer',
    kind: 'enum',
    options: (rows) =>
      uniqOptions(rows, (r) => r.customerId, (r) => r.customerName),
    get: (r) => r.customerId,
  },
  {
    id: 'total',
    label: 'Total',
    kind: 'number',
    get: (r) => r.totalAmount,
  },
];

const ORDER_VIEWS: SavedView[] = [
  { id: 'all', name: 'All', filters: [], builtin: true },
  {
    id: 'pending',
    name: 'Pending',
    builtin: true,
    filters: [{ id: 'f-pend', field: 'status', operator: 'any_of', values: ['pending'], num1: null, num2: null }],
  },
  {
    id: 'completed',
    name: 'Completed',
    builtin: true,
    filters: [{ id: 'f-done', field: 'status', operator: 'any_of', values: ['completed'], num1: null, num2: null }],
  },
];

function statusColors(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-[oklch(0.72_0.16_150/0.16)] text-[oklch(0.45_0.16_150)] dark:text-[oklch(0.85_0.18_150)]';
    case 'cancelled':
      return 'bg-[oklch(0.65_0.18_25/0.18)] text-[oklch(0.55_0.18_25)] dark:text-[oklch(0.78_0.18_25)]';
    case 'in_transit':
      return 'bg-[oklch(0.72_0.18_230/0.16)] text-[oklch(0.45_0.18_230)] dark:text-[oklch(0.80_0.18_230)]';
    case 'confirmed':
      return 'bg-[oklch(0.78_0.14_80/0.16)] text-[oklch(0.50_0.14_80)] dark:text-[oklch(0.82_0.14_80)]';
    default:
      return 'bg-mc-surface text-mc-text-muted';
  }
}

export default function OrdersPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pendingIds, setPendingIds] = useState<number[]>([]);

  const user = useAuthStore((s) => s.user);
  const { isConnected } = useSocket();
  const { data: orders = [], isLoading } = useOrders();
  const { data: customers = [] } = useCustomers();
  const createOrder = useCreateOrder();
  const { data: meSettings } = useSettings();
  const { t } = useTranslation('orders');

  // ── Create gate ──
  // Hide/disable "New Order" when tenant is integrated AND app-create is off.
  const ingestMode = meSettings?.tenant?.ingestMode ?? 'standalone';
  const allowAppOrderCreate = meSettings?.tenant?.allowAppOrderCreate ?? true;
  const canCreate =
    user?.role === 'admin' || user?.role === 'dispatcher'
      ? !(ingestMode === 'integrated' && allowAppOrderCreate === false)
      : false;

  // canWrite controls inline status updates in the detail panel (same gate).
  const canWrite = canCreate;

  // ── Customer name lookup ──
  const customerName = useMemo(
    () => new Map(customers.map((c) => [c.id, c.name])),
    [customers],
  );

  // ── Enrich orders with customer name for filtering ──
  const rows = useMemo<OrderRow[]>(
    () =>
      orders.map((o) => ({
        ...o,
        customerName: customerName.get(o.customerId) ?? `#${o.customerId}`,
      })),
    [orders, customerName],
  );

  const ds = useDatasetFilters('orders-page', rows, ORDER_FIELDS, ORDER_VIEWS);

  const selected = useMemo(
    () => ds.filtered.find((o) => o.id === selectedId) ?? null,
    [ds.filtered, selectedId],
  );

  const handleCreate = async (dto: CreateOrderDto) => {
    const result = await createOrder.mutateAsync(dto);
    if (result.status === 202) {
      // CDC path: show pending indicator for a few seconds
      const tempId = Date.now();
      setPendingIds((prev) => [...prev, tempId]);
      setTimeout(() => {
        setPendingIds((prev) => prev.filter((id) => id !== tempId));
      }, 5000);
    }
  };

  // Show the CDC syncing banner only when there are pending items AND the
  // tenant is in integrated mode (standalone writes are immediate).
  const showSyncBanner = pendingIds.length > 0 && ingestMode === 'integrated';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-mc-accent-border bg-mc-accent-soft text-mc-accent">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[18px] font-semibold tracking-[-0.02em] text-foreground">
              {t('page.title')}
            </div>
            <div className="mt-0.5 text-xs text-mc-text-muted">
              {t('page.subtitle', { count: orders.length })}
            </div>
          </div>
          {(user?.role === 'admin' || user?.role === 'dispatcher') && (
            <div className="ml-auto">
              <button
                type="button"
                onClick={() => canCreate && setDialogOpen(true)}
                disabled={!canCreate}
                title={!canCreate ? t('gate.disabled') : undefined}
                className={cn(
                  'flex h-8 items-center gap-[6px] rounded-mc px-3 text-[12.5px] font-medium',
                  canCreate
                    ? 'bg-mc-accent text-white hover:bg-mc-accent-strong'
                    : 'cursor-not-allowed bg-mc-surface text-mc-text-dim',
                )}
              >
                <Plus className="h-[13px] w-[13px]" />
                <span>{t('page.newOrder')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CDC pending banner */}
      {showSyncBanner && (
        <div className="flex items-center gap-2 border-b border-[oklch(0.78_0.14_80/0.25)] bg-[oklch(0.78_0.14_80/0.10)] px-6 py-2 text-[11.5px] text-[oklch(0.5_0.14_80)] dark:text-[oklch(0.85_0.16_80)]">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span
            dangerouslySetInnerHTML={{
              __html: t('banner.syncing', { names: t('page.newOrder') }),
            }}
          />
        </div>
      )}

      {/* Filter bar */}
      <FilterBar
        fields={ORDER_FIELDS}
        rows={rows}
        filters={ds.filters}
        onChange={ds.updateFilters}
        views={ds.views}
        activeViewId={ds.activeViewId}
        onSelectView={ds.selectView}
        onSaveView={ds.saveView}
        onDeleteView={ds.deleteView}
      />

      {/* Body: table + detail */}
      <div className="flex min-h-0 flex-1">
        <TableShell
          headers={[
            { label: t('table.order') },
            { label: t('table.customer') },
            { label: t('table.status') },
            { label: t('table.total'), num: true },
            { label: t('table.deliveryDate') },
            { label: t('table.created') },
          ]}
          count={ds.filtered.length}
          isLoading={isLoading}
          emptyMessage={t('table.empty')}
        >
          {ds.filtered.map((o) => {
            const isSelected = o.id === selectedId;
            const formattedTotal =
              o.totalAmount != null
                ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(
                    o.totalAmount,
                  )
                : '—';
            const formattedDelivery = o.deliveryDate
              ? new Date(o.deliveryDate + 'T00:00:00').toLocaleDateString()
              : '—';
            const formattedCreated = new Date(o.createdAt).toLocaleDateString();

            return (
              <tr
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-mc-surface',
                  isSelected && 'bg-mc-accent-soft/40',
                )}
              >
                <Td>
                  <span className="font-mono text-[12px] font-medium text-foreground">
                    {o.orderNumber || `#${o.id}`}
                  </span>
                </Td>
                <Td>
                  <span className="text-foreground">
                    {o.customerName}
                  </span>
                </Td>
                <Td>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-[7px] py-[1px] font-mono text-[10.5px] font-semibold',
                      statusColors(o.status),
                    )}
                  >
                    <span className="h-[5px] w-[5px] rounded-full bg-current" />
                    {t(`status.${o.status}`, { defaultValue: o.status })}
                  </span>
                </Td>
                <Td num>
                  <span className="font-mono text-[12px]">{formattedTotal}</span>
                </Td>
                <Td>
                  <span className="font-mono text-[11.5px] text-mc-text-muted">{formattedDelivery}</span>
                </Td>
                <Td>
                  <span className="font-mono text-[11.5px] text-mc-text-dim">{formattedCreated}</span>
                </Td>
              </tr>
            );
          })}
        </TableShell>

        <OrderDetailPanel
          order={selected}
          customerName={selected ? (customerName.get(selected.customerId) ?? null) : null}
          canWrite={canWrite}
          onClose={() => setSelectedId(null)}
        />
      </div>

      <Footer isConnected={isConnected} />

      <CreateOrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tenantId={user?.tenantId ?? ''}
        onSubmit={handleCreate}
        isLoading={createOrder.isPending}
      />
    </div>
  );
}
