import { useMemo, useState } from 'react';
import { GripVertical, Trash2, Clock, MapPin, Navigation } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

const statusColors: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  en_route: 'bg-blue-500/15 text-blue-600',
  arrived: 'bg-amber-500/15 text-amber-600',
  in_progress: 'bg-purple-500/15 text-purple-600',
  completed: 'bg-green-500/15 text-green-600',
  skipped: 'bg-zinc-500/15 text-zinc-500',
  failed: 'bg-red-500/15 text-red-600',
};

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SortableVisitCard({
  visit,
  customer,
  index,
  onDelete,
  disabled,
}: SortableVisitCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: visit.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isLocked = visit.status !== 'pending';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-2 rounded-lg border p-2.5 bg-card transition-colors',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-primary/30',
        isLocked && 'opacity-70',
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className={cn(
          'mt-1 p-0.5 rounded hover:bg-secondary cursor-grab active:cursor-grabbing',
          isLocked && 'cursor-not-allowed opacity-30',
        )}
        disabled={isLocked}
        tabIndex={-1}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Sequence number badge */}
      <div className="mt-0.5 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
        {index + 1}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 max-w-full">
          <span className="text-sm font-medium truncate flex-1 min-w-0">
            {customer?.name ?? `Customer #${visit.customerId}`}
          </span>
          <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0 shrink-0', statusColors[visit.status])}>
            {visit.status.replace('_', ' ')}
          </Badge>
        </div>

        {customer?.address && (
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 min-w-0">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate block">
              {customer.address}
            </span>
          </div>
        )}

        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          {visit.timeWindowStart && visit.timeWindowEnd && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {visit.timeWindowStart.slice(0, 5)}–{visit.timeWindowEnd.slice(0, 5)}
            </span>
          )}
          {visit.estimatedArrivalTime && (
            <span className="flex items-center gap-1 text-primary">
              <Navigation className="w-3 h-3" />
              ETA {formatTime(visit.estimatedArrivalTime)}
            </span>
          )}
          {visit.estimatedTravelSeconds != null && (
            <span>{formatDuration(visit.estimatedTravelSeconds)}</span>
          )}
          {visit.estimatedDistanceMeters != null && (
            <span>{formatDistance(visit.estimatedDistanceMeters)}</span>
          )}
        </div>
      </div>

      {/* Delete */}
      {!isLocked && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(visit.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
