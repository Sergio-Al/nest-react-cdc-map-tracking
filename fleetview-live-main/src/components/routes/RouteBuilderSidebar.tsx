import { useEffect } from 'react';
import { Plus, Wand2, Save, Loader2, Route as RouteIcon, ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { SortableVisitList } from './SortableVisitList';
import { CreateRouteDialog } from './CreateRouteDialog';
import { RouteSelector } from './RouteSelector';
import { useRouteBuilderStore } from '@/stores/routeBuilder.store';
import { useRouteBuilderActions } from '@/hooks/useRouteBuilderActions';
import { useRouteVisits, useCustomers } from '@/hooks/api/useRouteBuilder';
import { useRoutes } from '@/hooks/api/useRoutes';
import { useDrivers } from '@/hooks/api/useDrivers';
import { cn } from '@/lib/utils';
import type { Route } from '@/types/route.types';

const START_TIME = '07:30';

function fmtDate(date: string): string {
  try {
    return format(new Date(date), 'd MMM');
  } catch {
    return date;
  }
}

function fmtDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Add `seconds` to the fixed depot start time → "HH:MM". */
function returnEta(seconds: number | null): string | null {
  if (seconds == null) return null;
  const [sh, sm] = START_TIME.split(':').map(Number);
  const total = sh * 60 + sm + Math.round(seconds / 60);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function statusBadge(route: Route | undefined, stops: number) {
  if (!route || (route.status === 'planned' && stops === 0)) {
    return { label: 'draft', cls: 'border-mc-accent-border bg-mc-accent-soft text-mc-accent', dot: 'var(--mc-accent)' };
  }
  switch (route.status) {
    case 'in_progress':
      return { label: 'in progress', cls: 'border-border bg-mc-surface text-foreground', dot: 'var(--mc-status-moving)' };
    case 'completed':
      return { label: 'completed', cls: 'border-border bg-mc-surface text-foreground', dot: 'var(--mc-status-moving)' };
    case 'cancelled':
      return { label: 'cancelled', cls: 'border-border bg-mc-surface text-mc-text-dim', dot: 'var(--mc-status-offline)' };
    default:
      return { label: 'planned', cls: 'border-mc-accent-border bg-mc-accent-soft text-mc-accent', dot: 'var(--mc-accent)' };
  }
}

function DepotRow({
  label,
  meta,
  tag,
}: {
  label: 'A' | 'B';
  meta: string;
  tag: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-1 py-1.5">
      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-mc-border-strong bg-mc-surface font-mono text-[11px] font-bold text-mc-text-muted">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground">Depot</div>
        <div className="text-[11px] text-mc-text-dim">{meta}</div>
      </div>
      <span className="shrink-0 text-[10px] uppercase tracking-[0.06em] text-mc-text-dim">{tag}</span>
    </div>
  );
}

function StatCell({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-[0.07em] text-mc-text-dim">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-bold tabular-nums text-foreground">
        {value}
        {unit && <span className="ml-1 text-[10px] font-normal text-mc-text-dim">{unit}</span>}
      </div>
    </div>
  );
}

export function RouteBuilderSidebar() {
  const store = useRouteBuilderStore();
  const { selectedRouteId, selectedDriverId, localVisits, isDirty, isOptimizing } = store;

  const { data: routes = [], isLoading: routesLoading } = useRoutes();
  const { data: drivers = [] } = useDrivers();
  const { data: serverVisits = [] } = useRouteVisits(selectedRouteId);
  const { data: customers = [] } = useCustomers();

  const { optimize, saveOrder, deleteVisit, createRoute, isSaving, isCreating } =
    useRouteBuilderActions();

  // Sync server visits → local order while there are no unsaved edits.
  useEffect(() => {
    if (serverVisits.length > 0 && !isDirty) {
      store.setLocalVisits(serverVisits);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverVisits, isDirty]);

  const selectedRoute = routes.find((r) => r.id === selectedRouteId);

  // ── Route list (no route selected) ──
  if (!selectedRouteId) {
    return (
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-[7px] border border-mc-accent-border bg-mc-accent-soft text-mc-accent">
              <RouteIcon className="h-[14px] w-[14px]" />
            </span>
            <div>
              <div className="text-[13px] font-semibold">Route Builder</div>
              <div className="text-[11px] text-mc-text-dim">Pick a route to edit</div>
            </div>
          </div>
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => store.setCreateRouteDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {routesLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-mc-text-dim" />
            </div>
          ) : (
            <RouteSelector routes={routes} selectedRouteId={null} onSelectRoute={(id) => {
              const r = routes.find((x) => x.id === id);
              store.setSelectedRoute(id, r?.driverId ?? null);
            }} />
          )}
        </div>
        <CreateRouteDialog
          open={store.createRouteDialogOpen}
          onOpenChange={store.setCreateRouteDialogOpen}
          drivers={drivers}
          onSubmit={createRoute}
          isLoading={isCreating}
        />
      </aside>
    );
  }

  // ── Builder (route selected) ──
  const driver = drivers.find((d) => d.id === selectedDriverId);
  const isEditable = !selectedRoute || selectedRoute.status === 'planned';
  const hasStops = localVisits.length > 0;
  const badge = statusBadge(selectedRoute, localVisits.length);
  const distanceKm =
    selectedRoute?.totalDistanceMeters != null ? (selectedRoute.totalDistanceMeters / 1000).toFixed(1) : '—';
  const duration =
    selectedRoute?.totalEstimatedSeconds != null ? fmtDuration(selectedRoute.totalEstimatedSeconds) : '—';
  const eta = returnEta(selectedRoute?.totalEstimatedSeconds ?? null);

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-r border-border bg-background">
      {/* Header */}
      <div className="border-b border-border px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => store.setSelectedRoute(null)}
            title="Back to routes"
            className="group grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-mc-accent-border bg-mc-accent-soft text-mc-accent transition-colors hover:border-mc-border-strong"
          >
            <RouteIcon className="h-[14px] w-[14px] group-hover:hidden" />
            <ChevronLeft className="hidden h-[14px] w-[14px] group-hover:block" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-foreground">
              {driver?.name ?? 'Unknown driver'}
            </div>
            <div className="font-mono text-[11px] text-mc-text-dim">
              {selectedRoute ? fmtDate(selectedRoute.scheduledDate) : '—'}
              {driver?.vehiclePlate && ` · ${driver.vehiclePlate}`}
            </div>
          </div>
          <span className={cn('flex shrink-0 items-center gap-1.5 rounded-pill border px-2 py-0.5 text-[11px] font-medium', badge.cls)}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: badge.dot }} />
            {badge.label}
          </span>
        </div>

        {/* Stats */}
        {hasStops && (
          <div className="mt-3 grid grid-cols-3 rounded-mc border border-border bg-mc-surface">
            <div className="px-3 py-2"><StatCell label="Distance" value={distanceKm} unit="km" /></div>
            <div className="border-l border-border px-3 py-2"><StatCell label="Duration" value={duration} /></div>
            <div className="border-l border-border px-3 py-2"><StatCell label="Stops" value={String(localVisits.length)} /></div>
          </div>
        )}

        {/* Actions */}
        {isEditable && (
          <div className="mt-3 flex gap-2">
            <Button
              className="h-9 flex-1 gap-1.5"
              onClick={optimize}
              disabled={isOptimizing || localVisits.length < 2}
            >
              {isOptimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Optimize
            </Button>
            <Button variant="outline" className="h-9 gap-1.5" onClick={saveOrder} disabled={!isDirty || isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
            <Button variant="outline" className="h-9 gap-1.5" onClick={() => store.setPaletteOpen(true)}>
              <Plus className="h-4 w-4" />
              Stop
            </Button>
          </div>
        )}
      </div>

      {/* Stop list */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3.5 py-3">
        <DepotRow label="A" meta={`start ${START_TIME}`} tag="origin" />

        {hasStops && (
          <SortableVisitList
            visits={localVisits}
            customers={customers}
            onReorder={store.reorderVisit}
            onDeleteVisit={deleteVisit}
            disabled={!isEditable}
          />
        )}

        {hasStops && <DepotRow label="B" meta={eta ? `return · ETA ${eta}` : 'return'} tag="end" />}

        {/* Add a stop */}
        <button
          type="button"
          onClick={() => store.setPaletteOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-mc border border-dashed border-mc-border-strong px-2.5 py-2.5 text-[13px] text-mc-text-muted transition-colors hover:border-mc-accent-border hover:text-foreground"
        >
          <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-dashed border-mc-border-strong">
            <Plus className="h-3 w-3" />
          </span>
          <span className="flex-1 text-left">Add a stop</span>
          <kbd className="rounded border border-border bg-mc-surface px-1.5 py-px font-mono text-[10.5px] text-mc-text-dim">
            ⌘K
          </kbd>
        </button>
      </div>
    </aside>
  );
}
