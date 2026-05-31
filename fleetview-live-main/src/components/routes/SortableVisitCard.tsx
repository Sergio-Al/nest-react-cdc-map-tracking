import { GripVertical, Trash2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import type { PlannedVisit } from '@/types/visit.types';
import type { Customer } from '@/types/customer.types';
import { cn } from '@/lib/utils';

interface SortableVisitCardProps {
  visit: PlannedVisit;
  customer: Customer | undefined;
  index: number;
  onDelete: (visitId: string) => void;
  disabled?: boolean;
}

/** Returns a translation key under `routes:palette.window.*` for the visit's start hour. */
function windowKey(start: string | null): 'morning' | 'afternoon' | 'evening' | null {
  if (!start) return null;
  const h = Number(start.slice(0, 2));
  if (Number.isNaN(h)) return null;
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

export function SortableVisitCard({
  visit,
  customer,
  index,
  onDelete,
  disabled,
}: SortableVisitCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: visit.id,
    disabled,
  });
  const { t, i18n } = useTranslation('routes');

  const style = { transform: CSS.Transform.toString(transform), transition };
  const isLocked = visit.status !== 'pending';
  const isCompleted = visit.status === 'completed';
  const winKey = windowKey(visit.timeWindowStart);
  const winLabel = winKey ? t(`palette.window.${winKey}`) : null;
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-2.5 rounded-mc border border-border bg-mc-elev px-2.5 py-2 transition-colors',
        isDragging && 'opacity-60 shadow-mc-float ring-1 ring-mc-accent-border',
        !isLocked && 'hover:border-mc-border-strong',
        isLocked && 'opacity-80',
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        disabled={isLocked}
        tabIndex={-1}
        className={cn(
          '-ml-1 shrink-0 rounded p-0.5 text-mc-text-dim opacity-0 transition-opacity group-hover:opacity-100',
          isLocked ? 'cursor-not-allowed opacity-0' : 'cursor-grab active:cursor-grabbing',
        )}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Sequence badge */}
      <span
        className={cn(
          'grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold',
          isCompleted ? 'bg-status-moving text-white' : 'bg-mc-accent text-mc-accent-fg',
        )}
      >
        {index + 1}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">
            {customer?.name ?? t('visitCard.customerFallback', { id: visit.customerId })}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-mc-text-dim">
          <span className="truncate">{customer?.address ?? '—'}</span>
          {winLabel && visit.timeWindowStart && visit.timeWindowEnd && (
            <span className="shrink-0 text-mc-accent">
              · {winLabel} · {visit.timeWindowStart.slice(0, 5)}-{visit.timeWindowEnd.slice(0, 5)}
            </span>
          )}
        </div>
      </div>

      {/* Right column: ETA + distance */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {visit.estimatedArrivalTime && (
          <span className="font-mono text-[12px] tabular-nums text-foreground">
            {fmtTime(visit.estimatedArrivalTime)}
          </span>
        )}
        {visit.estimatedDistanceMeters != null && (
          <span className="font-mono text-[10.5px] text-mc-text-dim">
            +{(visit.estimatedDistanceMeters / 1000).toFixed(1)} km
          </span>
        )}
      </div>

      {/* Delete (hover) */}
      {!isLocked && (
        <button
          type="button"
          onClick={() => onDelete(visit.id)}
          className="shrink-0 rounded p-1 text-mc-text-dim opacity-0 transition-opacity hover:text-status-offline group-hover:opacity-100"
          aria-label={t('visitCard.remove')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
