import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useRouteBuilderStore } from '@/stores/routeBuilder.store';
import { useAuthStore } from '@/stores/auth.store';
import { useRoutes } from '@/hooks/api/useRoutes';
import {
  useOptimizeRoute,
  useReorderVisits,
  useAddVisit,
  useDeleteVisit,
  useCreateRoute,
  useUpdateRoute,
} from '@/hooks/api/useRouteBuilder';
import { translateApiError } from '@/lib/apiError';

const errMsg = translateApiError;

/**
 * Shared Route-Builder write actions. Lives in a hook so the sidebar buttons,
 * the add-stop palette, and map pin quick-add all drive the same mutations and
 * optimistic store updates instead of duplicating the logic.
 */
export function useRouteBuilderActions() {
  const store = useRouteBuilderStore();
  const { selectedRouteId, selectedDriverId, localVisits, isDirty } = store;
  const user = useAuthStore((s) => s.user);
  const { data: routes = [] } = useRoutes();
  const selectedRoute = routes.find((r) => r.id === selectedRouteId);
  const { t } = useTranslation('routes');

  const optimizeMut = useOptimizeRoute();
  const reorderMut = useReorderVisits();
  const addVisitMut = useAddVisit();
  const deleteVisitMut = useDeleteVisit();
  const createRouteMut = useCreateRoute();
  const updateRouteMut = useUpdateRoute();

  const addStops = useCallback(
    async (
      customerIds: number[],
      window: { start?: string; end?: string } = {},
    ) => {
      if (!selectedRouteId || !selectedDriverId || !user?.tenantId || customerIds.length === 0) {
        return;
      }
      const scheduledDate = selectedRoute?.scheduledDate ?? new Date().toISOString().slice(0, 10);
      try {
        const created = await Promise.all(
          customerIds.map((customerId, i) =>
            addVisitMut.mutateAsync({
              tenantId: user.tenantId,
              routeId: selectedRouteId,
              driverId: selectedDriverId,
              customerId,
              sequenceNumber: localVisits.length + i + 1,
              scheduledDate,
              timeWindowStart: window.start ? `${window.start}:00` : undefined,
              timeWindowEnd: window.end ? `${window.end}:00` : undefined,
            }),
          ),
        );
        // Optimistically reflect the persisted visits in the local order so the
        // sidebar updates immediately, rather than waiting for the refetch→sync
        // effect to bridge serverVisits → localVisits.
        created.forEach((visit) => store.addVisitLocally(visit));
        toast.success(t('toasts.stopsAdded', { count: customerIds.length }));
      } catch (err) {
        toast.error(errMsg(err, t('toasts.addFailed')));
      }
    },
    [selectedRouteId, selectedDriverId, user, selectedRoute, localVisits.length, addVisitMut, store, t],
  );

  const optimize = useCallback(async () => {
    if (!selectedRouteId) return;
    store.setIsOptimizing(true);
    try {
      const result = await optimizeMut.mutateAsync(selectedRouteId);
      store.setLastOptimizedAt(result.optimizedAt);
      store.markClean();
      toast.success(t('toasts.optimized'));
    } catch (err) {
      toast.error(errMsg(err, t('toasts.optimizeFailed')));
    } finally {
      store.setIsOptimizing(false);
    }
  }, [selectedRouteId, optimizeMut, store, t]);

  const saveOrder = useCallback(async () => {
    if (!selectedRouteId || !isDirty) return;
    try {
      await reorderMut.mutateAsync({
        routeId: selectedRouteId,
        visits: localVisits.map((v) => ({ visitId: v.id, sequenceNumber: v.sequenceNumber })),
      });
      store.markClean();
      toast.success(t('toasts.orderSaved'));
    } catch (err) {
      toast.error(errMsg(err, t('toasts.saveFailed')));
    }
  }, [selectedRouteId, isDirty, localVisits, reorderMut, store, t]);

  const deleteVisit = useCallback(
    async (visitId: string) => {
      if (!selectedRouteId) return;
      store.removeVisitLocally(visitId);
      try {
        await deleteVisitMut.mutateAsync({ visitId, routeId: selectedRouteId });
        toast.success(t('toasts.stopRemoved'));
      } catch (err) {
        toast.error(errMsg(err, t('toasts.removeFailed')));
      }
    },
    [selectedRouteId, deleteVisitMut, store, t],
  );

  const createRoute = useCallback(
    async (driverId: string, scheduledDate: string) => {
      if (!user?.tenantId) return;
      try {
        const route = await createRouteMut.mutateAsync({ tenantId: user.tenantId, driverId, scheduledDate });
        store.setSelectedRoute(route.id, route.driverId);
        toast.success(t('toasts.routeCreated'));
      } catch (err) {
        toast.error(errMsg(err, t('toasts.createFailed')));
      }
    },
    [user, createRouteMut, store, t],
  );

  /** Pin a fixed starting point (depot) on the route. */
  const setDepot = useCallback(
    async (lat: number, lon: number, label?: string) => {
      if (!selectedRouteId) return;
      store.setDepotPickMode(false);
      try {
        await updateRouteMut.mutateAsync({
          id: selectedRouteId,
          dto: { depotLat: lat, depotLon: lon, depotLabel: label ?? null },
        });
        toast.success(t('toasts.depotSet'));
      } catch (err) {
        toast.error(errMsg(err, t('toasts.depotFailed')));
      }
    },
    [selectedRouteId, updateRouteMut, store, t],
  );

  /** Clear the pin → route follows the driver's live GPS again. */
  const clearDepot = useCallback(async () => {
    if (!selectedRouteId) return;
    try {
      await updateRouteMut.mutateAsync({
        id: selectedRouteId,
        dto: { depotLat: null, depotLon: null, depotLabel: null },
      });
      toast.success(t('toasts.depotCleared'));
    } catch (err) {
      toast.error(errMsg(err, t('toasts.depotFailed')));
    }
  }, [selectedRouteId, updateRouteMut, t]);

  /** Toggle whether the route returns to the depot or ends at the last stop. */
  const setReturnToDepot = useCallback(
    async (returnToDepot: boolean) => {
      if (!selectedRouteId) return;
      try {
        await updateRouteMut.mutateAsync({ id: selectedRouteId, dto: { returnToDepot } });
        toast.success(t(returnToDepot ? 'toasts.returnEnabled' : 'toasts.returnDisabled'));
      } catch (err) {
        toast.error(errMsg(err, t('toasts.returnFailed')));
      }
    },
    [selectedRouteId, updateRouteMut, t],
  );

  /** Manually move the route through its lifecycle (start / complete / cancel / reopen). */
  const setRouteStatus = useCallback(
    async (status: 'planned' | 'in_progress' | 'completed' | 'cancelled') => {
      if (!selectedRouteId) return;
      const toastKey = {
        in_progress: 'toasts.routeStarted',
        completed: 'toasts.routeCompleted',
        cancelled: 'toasts.routeCancelled',
        planned: 'toasts.routeReopened',
      }[status];
      try {
        await updateRouteMut.mutateAsync({ id: selectedRouteId, dto: { status } });
        toast.success(t(toastKey));
      } catch (err) {
        toast.error(errMsg(err, t('toasts.statusFailed')));
      }
    },
    [selectedRouteId, updateRouteMut, t],
  );

  const reassignDriver = useCallback(
    async (driverId: string) => {
      if (!selectedRouteId || !driverId || driverId === selectedDriverId) return;
      // Reflect the new driver immediately; the route + visit queries reconcile via refetch.
      store.setSelectedDriver(driverId);
      try {
        await updateRouteMut.mutateAsync({ id: selectedRouteId, dto: { driverId } });
        toast.success(t('toasts.driverReassigned'));
      } catch (err) {
        store.setSelectedDriver(selectedDriverId); // revert on failure
        toast.error(errMsg(err, t('toasts.reassignFailed')));
      }
    },
    [selectedRouteId, selectedDriverId, updateRouteMut, store, t],
  );

  return {
    addStops,
    optimize,
    saveOrder,
    deleteVisit,
    createRoute,
    reassignDriver,
    setRouteStatus,
    setDepot,
    clearDepot,
    setReturnToDepot,
    isAdding: addVisitMut.isPending,
    isOptimizing: store.isOptimizing,
    isSaving: reorderMut.isPending,
    isCreating: createRouteMut.isPending,
    isReassigning: updateRouteMut.isPending,
  };
}
