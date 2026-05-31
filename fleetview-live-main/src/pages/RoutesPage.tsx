import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal } from 'lucide-react';
import { RouteBuilderSidebar } from '@/components/routes/RouteBuilderSidebar';
import { RouteBuilderMap } from '@/components/routes/RouteBuilderMap';
import { AddStopPalette } from '@/components/routes/AddStopPalette';
import { Footer } from '@/components/dashboard/Footer';
import { Button } from '@/components/ui/button';
import { useRouteBuilderStore } from '@/stores/routeBuilder.store';
import { useRouteBuilderActions } from '@/hooks/useRouteBuilderActions';
import { useCustomers, useRouteGeometry } from '@/hooks/api/useRouteBuilder';
import { useSocket } from '@/hooks/useSocket';

const CITY = 'La Paz, Bolivia';

function BuilderHead({
  hasRoute,
  onBackToRoutes,
  onOpenPalette,
}: {
  hasRoute: boolean;
  onBackToRoutes: () => void;
  onOpenPalette: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border px-3.5">
      <nav className="flex items-center gap-1.5 text-[13px]">
        <button className="text-muted-foreground hover:text-foreground" onClick={() => navigate('/')}>
          Fleet
        </button>
        <span className="text-mc-text-dim">/</span>
        <button className="text-muted-foreground hover:text-foreground" onClick={onBackToRoutes}>
          Routes
        </button>
        {hasRoute && (
          <>
            <span className="text-mc-text-dim">/</span>
            <span className="font-medium">Builder</span>
          </>
        )}
      </nav>
      <span className="font-mono text-[11.5px] text-muted-foreground">· {CITY}</span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenPalette}
          disabled={!hasRoute}
          className="hidden h-7 w-[260px] items-center gap-2 rounded-[7px] border border-border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:border-mc-border-strong disabled:opacity-50 lg:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Find customer to add…</span>
          <kbd className="rounded border border-border bg-mc-elev px-1.5 font-mono text-[10.5px]">⌘K</kbd>
        </button>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </Button>
      </div>
    </div>
  );
}

export default function RoutesPage() {
  const store = useRouteBuilderStore();
  const { selectedRouteId, localVisits, paletteOpen } = store;
  const { isConnected } = useSocket();
  const { data: customers = [] } = useCustomers();
  const { data: geometry } = useRouteGeometry(selectedRouteId, localVisits.length);
  const { addStops } = useRouteBuilderActions();

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
      />

      <div className="flex min-h-0 flex-1">
        <RouteBuilderSidebar />
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
