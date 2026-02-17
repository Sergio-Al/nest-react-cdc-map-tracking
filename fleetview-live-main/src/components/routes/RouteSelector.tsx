import { useMemo } from 'react';
import { CalendarDays, MapPin, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Route } from '@/types/route.types';

interface RouteSelectorProps {
  routes: Route[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
}

const statusBadge: Record<string, { label: string; className: string }> = {
  planned: { label: 'Planned', className: 'bg-blue-500/15 text-blue-600' },
  in_progress: { label: 'In Progress', className: 'bg-amber-500/15 text-amber-600' },
  completed: { label: 'Completed', className: 'bg-green-500/15 text-green-600' },
  cancelled: { label: 'Cancelled', className: 'bg-zinc-500/15 text-zinc-500' },
};

export function RouteSelector({ routes, selectedRouteId, onSelectRoute }: RouteSelectorProps) {
  const sorted = useMemo(
    () =>
      [...routes].sort((a, b) => {
        // planned first, then in_progress, then completed, then cancelled
        const order = { planned: 0, in_progress: 1, completed: 2, cancelled: 3 };
        const diff = (order[a.status] ?? 4) - (order[b.status] ?? 4);
        if (diff !== 0) return diff;
        return new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime();
      }),
    [routes],
  );

  if (sorted.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No routes yet. Create one to get started.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {sorted.map((route) => {
        const badge = statusBadge[route.status] ?? statusBadge.planned;
        const isSelected = route.id === selectedRouteId;
        return (
          <button
            key={route.id}
            onClick={() => onSelectRoute(route.id)}
            className={cn(
              'w-full text-left rounded-lg border px-3 py-2 transition-colors',
              isSelected
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'border-transparent hover:bg-secondary/50',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{route.scheduledDate}</span>
              </div>
              <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', badge.className)}>
                {badge.label}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {route.totalStops} stops
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {route.completedStops}/{route.totalStops}
              </span>
              {route.totalDistanceMeters != null && (
                <span>{(route.totalDistanceMeters / 1000).toFixed(1)} km</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
