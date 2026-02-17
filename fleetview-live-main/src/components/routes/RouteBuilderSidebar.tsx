import { useEffect, useCallback } from 'react';
import {
  Plus,
  Wand2,
  Save,
  Loader2,
  Route as RouteIcon,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SortableVisitList } from './SortableVisitList';
import { AddStopDialog } from './AddStopDialog';
import { CreateRouteDialog } from './CreateRouteDialog';
import { RouteSelector } from './RouteSelector';
import { useRouteBuilderStore } from '@/stores/routeBuilder.store';
import { useAuthStore } from '@/stores/auth.store';
import {
  useRouteVisits,
  useCustomers,
  useOptimizeRoute,
  useReorderVisits,
  useAddVisit,
  useDeleteVisit,
  useCreateRoute,
} from '@/hooks/api/useRouteBuilder';
import { useRoutes } from '@/hooks/api/useRoutes';
import { useDrivers } from '@/hooks/api/useDrivers';
import { toast } from 'sonner';
import type { Route } from '@/types/route.types';

export function RouteBuilderSidebar() {
  const { user } = useAuthStore();
  const store = useRouteBuilderStore();
  const {
    selectedRouteId,
    selectedDriverId,
    localVisits,
    isDirty,
    isOptimizing,
    addStopDialogOpen,
    createRouteDialogOpen,
  } = store;

  // Data
  const { data: routes = [], isLoading: routesLoading } = useRoutes();
  const { data: drivers = [] } = useDrivers();
  const { data: serverVisits = [] } = useRouteVisits(selectedRouteId);
  const { data: customers = [] } = useCustomers();

  // Mutations
  const optimizeMut = useOptimizeRoute();
  const reorderMut = useReorderVisits();
  const addVisitMut = useAddVisit();
  const deleteVisitMut = useDeleteVisit();
  const createRouteMut = useCreateRoute();

  // Sync server visits → local
  useEffect(() => {
    if (serverVisits.length > 0 && !isDirty) {
      store.setLocalVisits(serverVisits);
    }
  }, [serverVisits, isDirty]);

  // Selected route object
  const selectedRoute: Route | undefined = routes.find((r) => r.id === selectedRouteId);

  // Handlers
  const handleSelectRoute = useCallback(
    (routeId: string) => {
      const route = routes.find((r) => r.id === routeId);
      store.setSelectedRoute(routeId, route?.driverId ?? null);
    },
    [routes],
  );

  const handleOptimize = useCallback(async () => {
    if (!selectedRouteId) return;
    store.setIsOptimizing(true);
    try {
      const result = await optimizeMut.mutateAsync(selectedRouteId);
      store.setLastOptimizedAt(result.optimizedAt);
      store.markClean();
      toast.success('Route optimized successfully');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Optimization failed');
    } finally {
      store.setIsOptimizing(false);
    }
  }, [selectedRouteId]);

  const handleSaveOrder = useCallback(async () => {
    if (!selectedRouteId || !isDirty) return;
    try {
      await reorderMut.mutateAsync({
        routeId: selectedRouteId,
        visits: localVisits.map((v) => ({
          visitId: v.id,
          sequenceNumber: v.sequenceNumber,
        })),
      });
      store.markClean();
      toast.success('Order saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save order');
    }
  }, [selectedRouteId, isDirty, localVisits]);

  const handleAddStop = useCallback(
    async (customerId: number, timeWindowStart?: string, timeWindowEnd?: string) => {
      if (!selectedRouteId || !selectedDriverId || !user?.tenantId) return;
      try {
        await addVisitMut.mutateAsync({
          tenantId: user.tenantId,
          routeId: selectedRouteId,
          driverId: selectedDriverId,
          customerId,
          sequenceNumber: localVisits.length + 1,
          scheduledDate: selectedRoute?.scheduledDate ?? new Date().toISOString().slice(0, 10),
          timeWindowStart: timeWindowStart ? `${timeWindowStart}:00` : undefined,
          timeWindowEnd: timeWindowEnd ? `${timeWindowEnd}:00` : undefined,
        });
        toast.success('Stop added');
      } catch (err: any) {
        toast.error(err?.response?.data?.message || 'Failed to add stop');
      }
    },
    [selectedRouteId, selectedDriverId, localVisits.length, selectedRoute, user],
  );

  const handleDeleteVisit = useCallback(
    async (visitId: string) => {
      if (!selectedRouteId) return;
      store.removeVisitLocally(visitId);
      try {
        await deleteVisitMut.mutateAsync({ visitId, routeId: selectedRouteId });
        toast.success('Stop removed');
      } catch (err: any) {
        toast.error(err?.response?.data?.message || 'Failed to remove stop');
      }
    },
    [selectedRouteId],
  );

  const handleCreateRoute = useCallback(
    async (driverId: string, scheduledDate: string) => {
      if (!user?.tenantId) return;
      try {
        const route = await createRouteMut.mutateAsync({ tenantId: user.tenantId, driverId, scheduledDate });
        store.setSelectedRoute(route.id, route.driverId);
        toast.success('Route created');
      } catch (err: any) {
        toast.error(err?.response?.data?.message || 'Failed to create route');
      }
    },
    [],
  );

  // If no route selected, show route list
  if (!selectedRouteId) {
    return (
      <div className="w-96 shrink-0 border-r bg-card flex flex-col h-full">
        <div className="p-4 pb-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RouteIcon className="w-5 h-5 text-primary" />
              <h2 className="font-semibold">Route Builder</h2>
            </div>
            <Button size="sm" onClick={() => store.setCreateRouteDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              New Route
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3">
            {routesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <RouteSelector
                routes={routes}
                selectedRouteId={null}
                onSelectRoute={handleSelectRoute}
              />
            )}
          </div>
        </ScrollArea>

        <CreateRouteDialog
          open={createRouteDialogOpen}
          onOpenChange={store.setCreateRouteDialogOpen}
          drivers={drivers}
          onSubmit={handleCreateRoute}
          isLoading={createRouteMut.isPending}
        />
      </div>
    );
  }

  // Route detail view
  const driver = drivers.find((d) => d.id === selectedDriverId);
  const isEditable = selectedRoute?.status === 'planned';

  return (
    <div className="w-96 shrink-0 border-r bg-card flex flex-col h-full">
      {/* Header */}
      <div className="p-4 pb-3 border-b space-y-3">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 -ml-2"
            onClick={() => store.setSelectedRoute(null)}
          >
            <ArrowLeft className="w-4 h-4" />
            Routes
          </Button>
          {isDirty && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">
              Unsaved
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              {driver?.name ?? 'Unknown Driver'}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedRoute?.scheduledDate} · {localVisits.length} stops
              {selectedRoute?.totalDistanceMeters != null && (
                <> · {(selectedRoute.totalDistanceMeters / 1000).toFixed(1)} km</>
              )}
            </p>
          </div>
          <Badge
            variant="secondary"
            className="text-[10px]"
          >
            {selectedRoute?.status?.replace('_', ' ') ?? 'planned'}
          </Badge>
        </div>

        {/* Action buttons */}
        {isEditable && (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 gap-1"
              onClick={handleOptimize}
              disabled={isOptimizing || localVisits.length < 2}
            >
              {isOptimizing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5" />
              )}
              Optimize
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={handleSaveOrder}
              disabled={!isDirty || reorderMut.isPending}
            >
              {reorderMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => store.setAddStopDialogOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Stop
            </Button>
          </div>
        )}

        {selectedRoute?.optimizedAt && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            Optimized {new Date(selectedRoute.optimizedAt).toLocaleString()}
            {selectedRoute.optimizationMethod && ` (${selectedRoute.optimizationMethod})`}
          </div>
        )}
      </div>

      <Separator />

      {/* Sortable visit list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          <SortableVisitList
            visits={localVisits}
            customers={customers}
            onReorder={store.reorderVisit}
            onDeleteVisit={handleDeleteVisit}
            disabled={!isEditable}
          />
        </div>
      </ScrollArea>

      {/* Dialogs */}
      <AddStopDialog
        open={addStopDialogOpen}
        onOpenChange={store.setAddStopDialogOpen}
        customers={customers}
        existingCustomerIds={localVisits.map((v) => v.customerId)}
        onAdd={handleAddStop}
        isLoading={addVisitMut.isPending}
      />
    </div>
  );
}
