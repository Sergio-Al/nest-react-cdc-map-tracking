import { useMemo } from 'react';
import { CalendarDays, MapPin, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Route } from '@/types/route.types';

interface RouteSelectorProps {
  routes: Route[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
}

const STATUS_CLS: Record<string, string> = {
  planned: 'bg-blue-500/15 text-blue-600',
  in_progress: 'bg-amber-500/15 text-amber-600',
  completed: 'bg-green-500/15 text-green-600',
  cancelled: 'bg-zinc-500/15 text-zinc-500',
};

export function RouteSelector({ routes, selectedRouteId, onSelectRoute }: RouteSelectorProps) {
  const { t } = useTranslation('routes');

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
        {t('selector.empty')}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {sorted.map((route) => {
        const statusKey = (STATUS_CLS[route.status] ? route.status : 'planned') as keyof typeof STATUS_CLS;
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
              <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', STATUS_CLS[statusKey])}>
                {t(`selector.statusBadge.${statusKey}`)}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {t('selector.stops', { count: route.totalStops })}
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
