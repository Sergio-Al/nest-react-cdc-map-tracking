import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { RouteBuilderSidebar } from '@/components/routes/RouteBuilderSidebar';
import { RouteBuilderMap } from '@/components/routes/RouteBuilderMap';
import { AddStopPalette } from '@/components/routes/AddStopPalette';
import { RouteFilters } from '@/components/routes/RouteFilters';
import { ROUTE_LIST_FIELDS, ROUTE_LIST_VIEWS } from '@/components/routes/routeListFilters';
import type { RouteListRow } from '@/components/routes/routeListFilters';
import { Footer } from '@/components/dashboard/Footer';
import { useRouteBuilderStore } from '@/stores/routeBuilder.store';
import { useRouteBuilderActions } from '@/hooks/useRouteBuilderActions';
import { useCustomers, useRouteGeometry } from '@/hooks/api/useRouteBuilder';
import { useRoutes } from '@/hooks/api/useRoutes';
import { useDrivers } from '@/hooks/api/useDrivers';
import { useDatasetFilters } from '@/components/filters/useDatasetFilters';
import { useSocket } from '@/hooks/useSocket';

function BuilderHead({
  hasRoute,
  onBackToRoutes,
  onOpenPalette,
  filtersSlot,
}: {
  hasRoute: boolean;
  onBackToRoutes: () => void;
  onOpenPalette: () => void;
  filtersSlot?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation('routes');
  const { t: tDashboard } = useTranslation('dashboard');
  return (
    <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border px-3.5">
      <nav className="flex items-center gap-1.5 text-[13px]">
        <button className="text-muted-foreground hover:text-foreground" onClick={() => navigate('/')}>
          {t('page.fleet')}
        </button>
        <span className="text-mc-text-dim">/</span>
        <button className="text-muted-foreground hover:text-foreground" onClick={onBackToRoutes}>
          {t('page.routes')}
        </button>
        {hasRoute && (
          <>
            <span className="text-mc-text-dim">/</span>
            <span className="font-medium">{t('page.builder')}</span>
          </>
        )}
      </nav>
      <span className="font-mono text-[11.5px] text-muted-foreground">· {tDashboard('city')}</span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenPalette}
          disabled={!hasRoute}
          className="hidden h-7 w-[260px] items-center gap-2 rounded-[7px] border border-border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:border-mc-border-strong disabled:opacity-50 lg:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">{t('page.findCustomer')}</span>
          <kbd className="rounded border border-border bg-mc-elev px-1.5 font-mono text-[10.5px]">⌘K</kbd>
        </button>
        {filtersSlot}
      </div>
    </div>
  );
}

export default function RoutesPage() {
  const store = useRouteBuilderStore();
  const { selectedRouteId, localVisits, paletteOpen } = store;
  const { isConnected } = useSocket();
  const { data: customers = [] } = useCustomers();
  const { data: routes = [] } = useRoutes();
  const { data: drivers = [] } = useDrivers();
  const { data: geometry } = useRouteGeometry(selectedRouteId, localVisits.length);
  const { addStops } = useRouteBuilderActions();

  // Enrich routes with their driver's name so the list can be filtered by driver.
  const routeRows = useMemo<RouteListRow[]>(() => {
    const nameById = new Map(drivers.map((d) => [d.id, d.name]));
    return routes.map((r) => ({ ...r, driverName: nameById.get(r.driverId) ?? '' }));
  }, [routes, drivers]);

  const ds = useDatasetFilters('routes-builder', routeRows, ROUTE_LIST_FIELDS, ROUTE_LIST_VIEWS);

  const existingIds = useMemo(() => localVisits.map((v) => v.customerId), [localVisits]);

  // Distance/nearness reference: the last stop, falling back to the depot.
  const origin = useMemo(() => {
    const last = localVisits[localVisits.length - 1];
    const lastCust = last ? customers.find((c) => c.id === last.customerId) : undefined;
    if (lastCust?.latitude != null && lastCust?.longitude != null) {
      return { lat: lastCust.latitude, lon: lastCust.longitude };
    }
    if (geometry?.depot) return { lat: geometry.depot.lat, lon: geometry.depot.lon };
    return null;
  }, [localVisits, customers, geometry]);

  // ⌘K opens the add-stop palette when a route is open. Capture phase + stop
  // propagation so it beats the app-wide command palette (a bubble listener).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && selectedRouteId) {
        e.preventDefault();
        e.stopImmediatePropagation();
        store.setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteId]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <BuilderHead
        hasRoute={!!selectedRouteId}
        onBackToRoutes={() => store.setSelectedRoute(null)}
        onOpenPalette={() => store.setPaletteOpen(true)}
        filtersSlot={
          !selectedRouteId ? (
            <RouteFilters
              rows={routeRows}
              filters={ds.filters}
              onChange={ds.updateFilters}
              views={ds.views}
              activeViewId={ds.activeViewId}
              onSelectView={ds.selectView}
              onSaveView={ds.saveView}
              onDeleteView={ds.deleteView}
            />
          ) : null
        }
      />

      <div className="flex min-h-0 flex-1">
        <RouteBuilderSidebar listRoutes={ds.filtered} />
        <RouteBuilderMap
          visits={localVisits}
          customers={customers}
          geometry={geometry ?? null}
          onQuickAdd={(id) => addStops([id])}
          onOpenPalette={() => store.setPaletteOpen(true)}
          isEmpty={!!selectedRouteId && localVisits.length === 0}
        />
      </div>

      <Footer isConnected={isConnected} />

      <AddStopPalette
        open={paletteOpen}
        onClose={() => store.setPaletteOpen(false)}
        customers={customers}
        existingCustomerIds={existingIds}
        origin={origin}
        onAdd={(ids, window, keepOpen) => {
          addStops(ids, window);
          if (!keepOpen) store.setPaletteOpen(false);
        }}
      />
    </div>
  );
}
