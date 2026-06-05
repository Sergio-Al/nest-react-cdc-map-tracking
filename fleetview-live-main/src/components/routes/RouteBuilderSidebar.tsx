import { useEffect, useMemo } from 'react';
import { Plus, Wand2, Save, Loader2, Route as RouteIcon, ChevronLeft, ChevronDown, MapPin, Crosshair, RotateCcw, Play, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SortableVisitList } from './SortableVisitList';
import { CreateRouteDialog } from './CreateRouteDialog';
import { RouteSelector } from './RouteSelector';
import { useRouteBuilderStore } from '@/stores/routeBuilder.store';
import { useRouteBuilderActions } from '@/hooks/useRouteBuilderActions';
import { useAuthStore } from '@/stores/auth.store';
import { useHasFeature } from '@/hooks/api/useEntitlements';
import { useRouteVisits, useCustomers } from '@/hooks/api/useRouteBuilder';
import { useRoutes } from '@/hooks/api/useRoutes';
import { useDrivers } from '@/hooks/api/useDrivers';
import { useDateLocale } from '@/i18n/useDateLocale';
import { cn } from '@/lib/utils';
import { busyDriverIds } from '@/lib/routeAssignment';
import type { Route } from '@/types/route.types';

const START_TIME = '07:30';

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

/** Returns a translation key under `routes:sidebar.status.*` based on route state. */
function statusBadgeKey(route: Route | undefined, stops: number): {
  key: string;
  cls: string;
  dot: string;
} {
  if (!route || (route.status === 'planned' && stops === 0)) {
    return { key: 'draft', cls: 'border-mc-accent-border bg-mc-accent-soft text-mc-accent', dot: 'var(--mc-accent)' };
  }
  switch (route.status) {
    case 'in_progress':
      return { key: 'in_progress', cls: 'border-border bg-mc-surface text-foreground', dot: 'var(--mc-status-moving)' };
    case 'completed':
      return { key: 'completed', cls: 'border-border bg-mc-surface text-foreground', dot: 'var(--mc-status-moving)' };
    case 'cancelled':
      return { key: 'cancelled', cls: 'border-border bg-mc-surface text-mc-text-dim', dot: 'var(--mc-status-offline)' };
    default:
      return { key: 'planned', cls: 'border-mc-accent-border bg-mc-accent-soft text-mc-accent', dot: 'var(--mc-accent)' };
  }
}

type RouteStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

/** Route status pill. For admin/dispatcher it's a dropdown with lifecycle actions. */
function StatusBadge({
  badge,
  label,
  status,
  canManage,
  hasStops,
  onSetStatus,
}: {
  badge: { cls: string; dot: string };
  label: string;
  status: RouteStatus | undefined;
  canManage: boolean;
  hasStops: boolean;
  onSetStatus: (status: RouteStatus) => void;
}) {
  const { t } = useTranslation('routes');
  const pill = (
    <span className={cn('flex shrink-0 items-center gap-1.5 rounded-pill border px-2 py-0.5 text-[11px] font-medium', badge.cls)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: badge.dot }} />
      {label}
      {canManage && <ChevronDown className="h-3 w-3 opacity-60" />}
    </span>
  );

  if (!canManage || !status) return pill;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="outline-none">{pill}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {status === 'planned' && (
          <>
            <DropdownMenuItem disabled={!hasStops} onClick={() => onSetStatus('in_progress')}>
              <Play className="mr-2 h-3.5 w-3.5" />
              {t('sidebar.statusActions.start')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSetStatus('cancelled')}>
              <XCircle className="mr-2 h-3.5 w-3.5" />
              {t('sidebar.statusActions.cancel')}
            </DropdownMenuItem>
          </>
        )}
        {status === 'in_progress' && (
          <>
            <DropdownMenuItem onClick={() => onSetStatus('completed')}>
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
              {t('sidebar.statusActions.complete')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSetStatus('cancelled')}>
              <XCircle className="mr-2 h-3.5 w-3.5" />
              {t('sidebar.statusActions.cancel')}
            </DropdownMenuItem>
          </>
        )}
        {(status === 'completed' || status === 'cancelled') && (
          <DropdownMenuItem onClick={() => onSetStatus('planned')}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            {t('sidebar.statusActions.reopen')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DepotRow({
  label,
  title,
  meta,
  tag,
}: {
  label: 'A' | 'B';
  title: string;
  meta: string;
  tag: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-1 py-1.5">
      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-mc-border-strong bg-mc-surface font-mono text-[11px] font-bold text-mc-text-muted">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground">{title}</div>
        <div className="text-[11px] text-mc-text-dim">{meta}</div>
      </div>
      <span className="shrink-0 text-[10px] uppercase tracking-[0.06em] text-mc-text-dim">{tag}</span>
    </div>
  );
}

/** Editable origin (A) row: pick a fixed start point or follow driver live GPS. */
function OriginRow({
  pinned,
  startTime,
  pinnedLabel,
  editable,
  onPick,
  onUseLive,
}: {
  pinned: boolean;
  startTime: string;
  pinnedLabel: string;
  editable: boolean;
  onPick: () => void;
  onUseLive: () => void;
}) {
  const { t } = useTranslation('routes');
  const meta = pinned
    ? pinnedLabel
    : t('sidebar.depotLive');
  return (
    <div className="rounded-mc px-1 py-1.5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-mc-border-strong bg-mc-surface font-mono text-[11px] font-bold text-mc-text-muted">
          A
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-foreground">
            {pinned ? t('sidebar.startPoint') : t('sidebar.depot')}
          </div>
          <div className="truncate text-[11px] text-mc-text-dim">
            {meta} · {t('sidebar.depotStart', { time: startTime })}
          </div>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-[0.06em] text-mc-text-dim">
          {t('sidebar.depotTagOrigin')}
        </span>
      </div>
      {editable && (
        <div className="mt-1.5 flex gap-1.5 pl-[32px]">
          <button
            type="button"
            onClick={onPick}
            className="flex items-center gap-1.5 rounded-mc border border-border bg-mc-surface px-2 py-1 text-[11px] text-mc-text-muted transition-colors hover:border-mc-accent-border hover:text-foreground"
          >
            <MapPin className="h-3 w-3" />
            {t('sidebar.depotPick')}
          </button>
          {pinned && (
            <button
              type="button"
              onClick={onUseLive}
              className="flex items-center gap-1.5 rounded-mc border border-border bg-mc-surface px-2 py-1 text-[11px] text-mc-text-muted transition-colors hover:border-mc-accent-border hover:text-foreground"
            >
              <Crosshair className="h-3 w-3" />
              {t('sidebar.depotUseLive')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Segmented control: return to start vs. end at last stop. */
function ReturnToggle({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled: boolean;
  onChange: (returnToDepot: boolean) => void;
}) {
  const { t } = useTranslation('routes');
  const opt = (active: boolean, label: string, icon: React.ReactNode, val: boolean) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !active && onChange(val)}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
        active ? 'bg-mc-surface text-foreground shadow-mc-card' : 'text-mc-text-dim hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="mx-1 flex gap-1 rounded-mc border border-border bg-background p-0.5">
      {opt(value, t('sidebar.returnToDepot'), <RotateCcw className="h-3 w-3" />, true)}
      {opt(!value, t('sidebar.endAtLastStop'), <MapPin className="h-3 w-3" />, false)}
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

interface RouteBuilderSidebarProps {
  /** Filtered routes to show in the list view; falls back to all routes. */
  listRoutes?: Route[];
}

export function RouteBuilderSidebar({ listRoutes }: RouteBuilderSidebarProps = {}) {
  const store = useRouteBuilderStore();
  const { selectedRouteId, selectedDriverId, localVisits, isDirty, isOptimizing } = store;
  const { t } = useTranslation('routes');
  const dateLocale = useDateLocale();

  const fmtDate = (date: string): string => {
    try {
      return format(new Date(date), 'd MMM', { locale: dateLocale });
    } catch {
      return date;
    }
  };

  const { data: routes = [], isLoading: routesLoading } = useRoutes();
  const { data: drivers = [] } = useDrivers();
  const { data: serverVisits = [] } = useRouteVisits(selectedRouteId);
  const { data: customers = [] } = useCustomers();

  const {
    optimize,
    saveOrder,
    deleteVisit,
    createRoute,
    reassignDriver,
    setRouteStatus,
    clearDepot,
    setReturnToDepot,
    isSaving,
    isCreating,
    isReassigning,
  } = useRouteBuilderActions();
  const userRole = useAuthStore((s) => s.user?.role);
  const canManageStatus = userRole === 'admin' || userRole === 'dispatcher';
  const canOptimize = useHasFeature('route_optimization');

  // Sync server visits → local order while there are no unsaved edits.
  useEffect(() => {
    if (serverVisits.length > 0 && !isDirty) {
      store.setLocalVisits(serverVisits);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverVisits, isDirty]);

  const selectedRoute = routes.find((r) => r.id === selectedRouteId);

  // Drivers selectable for reassignment: drop anyone who already owns another
  // (non-cancelled) route on this date, but always keep the current driver.
  const assignableDrivers = useMemo(() => {
    const busy = busyDriverIds(routes, selectedRoute?.scheduledDate, selectedRouteId);
    return drivers.filter((d) => !busy.has(d.id) || d.id === selectedDriverId);
  }, [drivers, routes, selectedRoute?.scheduledDate, selectedRouteId, selectedDriverId]);

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
              <div className="text-[13px] font-semibold">{t('sidebar.title')}</div>
              <div className="text-[11px] text-mc-text-dim">{t('sidebar.subtitle')}</div>
            </div>
          </div>
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => store.setCreateRouteDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t('sidebar.new')}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {routesLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-mc-text-dim" />
            </div>
          ) : (
            <RouteSelector routes={listRoutes ?? routes} selectedRouteId={null} onSelectRoute={(id) => {
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
  const badge = statusBadgeKey(selectedRoute, localVisits.length);
  const distanceKm =
    selectedRoute?.totalDistanceMeters != null ? (selectedRoute.totalDistanceMeters / 1000).toFixed(1) : '—';
  const duration =
    selectedRoute?.totalEstimatedSeconds != null ? fmtDuration(selectedRoute.totalEstimatedSeconds) : '—';
  const eta = returnEta(selectedRoute?.totalEstimatedSeconds ?? null);

  // Starting point (depot) state.
  const depotPinned = selectedRoute?.depotLat != null && selectedRoute?.depotLon != null;
  const pinnedLabel = depotPinned
    ? selectedRoute!.depotLabel ||
      `${selectedRoute!.depotLat!.toFixed(4)}, ${selectedRoute!.depotLon!.toFixed(4)}`
    : '';
  const returnToDepot = selectedRoute?.returnToDepot ?? true;

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-r border-border bg-background">
      {/* Header */}
      <div className="border-b border-border px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => store.setSelectedRoute(null)}
            title={t('sidebar.back')}
            className="group grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-mc-accent-border bg-mc-accent-soft text-mc-accent transition-colors hover:border-mc-border-strong"
          >
            <RouteIcon className="h-[14px] w-[14px] group-hover:hidden" />
            <ChevronLeft className="hidden h-[14px] w-[14px] group-hover:block" />
          </button>
          <div className="min-w-0 flex-1">
            {isEditable ? (
              <Select
                value={selectedDriverId ?? ''}
                onValueChange={reassignDriver}
                disabled={isReassigning}
              >
                <SelectTrigger className="h-auto truncate border-0 bg-transparent p-0 text-[13px] font-semibold text-foreground shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:ml-1 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-50">
                  <SelectValue placeholder={t('sidebar.unknownDriver')} />
                </SelectTrigger>
                <SelectContent>
                  {assignableDrivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="truncate text-[13px] font-semibold text-foreground">
                {driver?.name ?? t('sidebar.unknownDriver')}
              </div>
            )}
            <div className="font-mono text-[11px] text-mc-text-dim">
              {selectedRoute ? fmtDate(selectedRoute.scheduledDate) : '—'}
              {driver?.vehiclePlate && ` · ${driver.vehiclePlate}`}
            </div>
          </div>
          <StatusBadge
            badge={badge}
            label={t(`sidebar.status.${badge.key}`)}
            status={selectedRoute?.status}
            canManage={canManageStatus}
            hasStops={hasStops}
            onSetStatus={setRouteStatus}
          />
        </div>

        {/* Stats */}
        {hasStops && (
          <div className="mt-3 grid grid-cols-3 rounded-mc border border-border bg-mc-surface">
            <div className="px-3 py-2"><StatCell label={t('sidebar.stats.distance')} value={distanceKm} unit="km" /></div>
            <div className="border-l border-border px-3 py-2"><StatCell label={t('sidebar.stats.duration')} value={duration} /></div>
            <div className="border-l border-border px-3 py-2"><StatCell label={t('sidebar.stats.stops')} value={String(localVisits.length)} /></div>
          </div>
        )}

        {/* Actions */}
        {isEditable && (
          <div className="mt-3 flex gap-2">
            <Button
              className="h-9 flex-1 gap-1.5"
              onClick={canOptimize ? optimize : undefined}
              disabled={isOptimizing || localVisits.length < 2 || !canOptimize}
              title={!canOptimize ? t('sidebar.actions.optimizeLocked') : undefined}
            >
              {isOptimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {t('sidebar.actions.optimize')}
            </Button>
            <Button variant="outline" className="h-9 gap-1.5" onClick={saveOrder} disabled={!isDirty || isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('sidebar.actions.save')}
            </Button>
            <Button variant="outline" className="h-9 gap-1.5" onClick={() => store.setPaletteOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('sidebar.actions.stop')}
            </Button>
          </div>
        )}
      </div>

      {/* Stop list */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3.5 py-3">
        <OriginRow
          pinned={depotPinned}
          startTime={START_TIME}
          pinnedLabel={pinnedLabel}
          editable={isEditable}
          onPick={() => store.setDepotPickMode(true)}
          onUseLive={clearDepot}
        />

        {hasStops && (
          <SortableVisitList
            visits={localVisits}
            customers={customers}
            onReorder={store.reorderVisit}
            onDeleteVisit={deleteVisit}
            disabled={!isEditable}
          />
        )}

        {hasStops && isEditable && (
          <ReturnToggle value={returnToDepot} disabled={isReassigning} onChange={setReturnToDepot} />
        )}

        {hasStops && (
          <DepotRow
            label="B"
            title={returnToDepot ? t('sidebar.depot') : t('sidebar.endAtLastStop')}
            meta={
              returnToDepot
                ? eta
                  ? t('sidebar.depotReturnEta', { eta })
                  : t('sidebar.depotReturn')
                : pinnedLabel || t('sidebar.depotLive')
            }
            tag={t('sidebar.depotTagEnd')}
          />
        )}

        {/* Add a stop */}
        <button
          type="button"
          onClick={() => store.setPaletteOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-mc border border-dashed border-mc-border-strong px-2.5 py-2.5 text-[13px] text-mc-text-muted transition-colors hover:border-mc-accent-border hover:text-foreground"
        >
          <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-dashed border-mc-border-strong">
            <Plus className="h-3 w-3" />
          </span>
          <span className="flex-1 text-left">{t('sidebar.addStop')}</span>
          <kbd className="rounded border border-border bg-mc-surface px-1.5 py-px font-mono text-[10.5px] text-mc-text-dim">
            ⌘K
          </kbd>
        </button>
      </div>
    </aside>
  );
}
