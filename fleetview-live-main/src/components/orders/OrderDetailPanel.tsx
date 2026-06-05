import { useState } from 'react';
import { ShoppingCart, Calendar, Hash, DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DirectoryDetailPanel, type DirectoryDetailTab } from '@/components/ui/directory-detail-panel';
import { useUpdateOrder } from '@/hooks/api/useOrders';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/order.types';

interface Props {
  order: Order | null;
  customerName: string | null;
  /** When false the status-update control is hidden (integrated + gate disabled). */
  canWrite: boolean;
  onClose: () => void;
}

const STATUS_OPTIONS = ['pending', 'confirmed', 'in_transit', 'completed', 'cancelled'] as const;

function statusColors(status: string) {
  switch (status) {
    case 'completed':
      return 'border-[oklch(0.72_0.16_150/0.35)] bg-[oklch(0.72_0.16_150/0.12)] text-[oklch(0.55_0.16_150)] dark:text-[oklch(0.85_0.18_150)]';
    case 'cancelled':
      return 'border-[oklch(0.65_0.18_25/0.35)] bg-[oklch(0.65_0.18_25/0.12)] text-[oklch(0.55_0.18_25)] dark:text-[oklch(0.78_0.18_25)]';
    case 'in_transit':
      return 'border-[oklch(0.72_0.18_230/0.35)] bg-[oklch(0.72_0.18_230/0.12)] text-[oklch(0.45_0.18_230)] dark:text-[oklch(0.80_0.18_230)]';
    case 'confirmed':
      return 'border-[oklch(0.78_0.14_80/0.35)] bg-[oklch(0.78_0.14_80/0.12)] text-[oklch(0.50_0.14_80)] dark:text-[oklch(0.82_0.14_80)]';
    default:
      return 'border-border bg-mc-surface text-mc-text-muted';
  }
}

export function OrderDetailPanel({ order, customerName, canWrite, onClose }: Props) {
  const { t } = useTranslation('orders');
  const updateOrder = useUpdateOrder();
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    if (!order || newStatus === order.status) return;
    setUpdatingStatus(true);
    try {
      await updateOrder.mutateAsync({ id: order.id, dto: { status: newStatus } });
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (!order) {
    return (
      <DirectoryDetailPanel
        isEmpty
        emptyTitle={t('detail.empty.title')}
        emptySubtitle={t('detail.empty.subtitle')}
      />
    );
  }

  const tabs: DirectoryDetailTab[] = [
    { id: 'overview', label: t('detail.tabs.overview') },
  ];

  const formattedTotal =
    order.totalAmount != null
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(
          order.totalAmount,
        )
      : '—';

  const formattedDelivery = order.deliveryDate
    ? new Date(order.deliveryDate + 'T00:00:00').toLocaleDateString()
    : '—';

  const formattedCreated = new Date(order.createdAt).toLocaleDateString();

  return (
    <DirectoryDetailPanel
      onClose={onClose}
      icon={
        <span className="inline-grid h-8 w-8 place-items-center rounded-full bg-mc-accent-soft text-mc-accent">
          <ShoppingCart className="h-4 w-4" />
        </span>
      }
      title={order.orderNumber || `#${order.id}`}
      subtitle={customerName ?? `Customer #${order.customerId}`}
      status={
        <span
          className={cn(
            'flex items-center gap-1 rounded-[5px] border px-[7px] py-[2px] font-mono text-[10.5px] font-medium',
            statusColors(order.status),
          )}
        >
          {t(`status.${order.status}`, { defaultValue: order.status })}
        </span>
      }
      tabs={tabs}
      activeTabId="overview"
    >
      <div className="flex flex-col gap-0">
        {/* Order fields */}
        <div className="border-b border-border px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            {t('detail.sections.orderInfo')}
          </div>
          <div className="overflow-hidden rounded-[8px] border border-border bg-mc-elev">
            <MetaRow
              label={t('detail.fields.customer')}
              value={
                <span className="font-mono text-[11.5px] text-foreground">
                  {customerName ?? `#${order.customerId}`}
                </span>
              }
            />
            <MetaRow
              label={t('detail.fields.orderNumber')}
              value={
                <span className="flex items-center gap-1 font-mono text-[11.5px] text-foreground">
                  <Hash className="h-3 w-3 text-mc-text-dim" />
                  {order.orderNumber || '—'}
                </span>
              }
            />
            <MetaRow
              label={t('detail.fields.total')}
              value={
                <span className="flex items-center gap-1 font-mono text-[11.5px] text-foreground">
                  <DollarSign className="h-3 w-3 text-mc-text-dim" />
                  {formattedTotal}
                </span>
              }
            />
            <MetaRow
              label={t('detail.fields.deliveryDate')}
              value={
                <span className="flex items-center gap-1 font-mono text-[11.5px] text-foreground">
                  <Calendar className="h-3 w-3 text-mc-text-dim" />
                  {formattedDelivery}
                </span>
              }
            />
            <MetaRow
              label={t('detail.fields.created')}
              value={
                <span className="font-mono text-[11.5px] text-mc-text-dim">{formattedCreated}</span>
              }
              last
            />
          </div>
        </div>

        {/* Status update (write-gated) */}
        {canWrite && (
          <div className="border-b border-border px-4 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
              {t('detail.actions.updateStatus')}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={updatingStatus || s === order.status}
                  onClick={() => handleStatusChange(s)}
                  className={cn(
                    'rounded-[6px] border px-2 py-[5px] text-[11.5px] font-medium transition-colors',
                    s === order.status
                      ? cn(statusColors(s), 'cursor-default')
                      : 'border-border bg-mc-surface text-mc-text-muted hover:border-mc-border-strong hover:text-foreground',
                    updatingStatus && 'opacity-50',
                  )}
                >
                  {updatingStatus && s !== order.status
                    ? null
                    : t(`status.${s}`, { defaultValue: s })}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            {t('detail.sections.notes')}
          </div>
          {order.notes ? (
            <p className="rounded-[8px] border border-border bg-mc-elev px-3 py-2.5 text-[12px] leading-relaxed text-foreground">
              {order.notes}
            </p>
          ) : (
            <p className="text-[12px] text-mc-text-dim">{t('detail.sections.noNotes')}</p>
          )}
        </div>
      </div>
    </DirectoryDetailPanel>
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
