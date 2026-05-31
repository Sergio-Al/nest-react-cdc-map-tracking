import { useCallback } from 'react';
import { toast } from 'sonner';
import { useRouteBuilderStore } from '@/stores/routeBuilder.store';
import { useAuthStore } from '@/stores/auth.store';
import { useRoutes } from '@/hooks/api/useRoutes';
import {
  useOptimizeRoute,
  useReorderVisits,
  useAddVisit,
  useDeleteVisit,
  useCreateRoute,
} from '@/hooks/api/useRouteBuilder';

/** Pull a server error message out of an axios-style error, with a fallback. */
function errMsg(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
  return data?.message ?? fallback;
}

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

  const optimizeMut = useOptimizeRoute();
  const reorderMut = useReorderVisits();
  const addVisitMut = useAddVisit();
  const deleteVisitMut = useDeleteVisit();
  const createRouteMut = useCreateRoute();

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
        await Promise.all(
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
        toast.success(customerIds.length === 1 ? 'Stop added' : `${customerIds.length} stops added`);
      } catch (err) {
        toast.error(errMsg(err, 'Failed to add stop'));
      }
    },
    [selectedRouteId, selectedDriverId, user, selectedRoute, localVisits.length, addVisitMut],
  );

  const optimize = useCallback(async () => {
    if (!selectedRouteId) return;
    store.setIsOptimizing(true);
    try {
      const result = await optimizeMut.mutateAsync(selectedRouteId);
      store.setLastOptimizedAt(result.optimizedAt);
      store.markClean();
      toast.success('Route optimized');
    } catch (err) {
      toast.error(errMsg(err, 'Optimization failed'));
    } finally {
      store.setIsOptimizing(false);
    }
  }, [selectedRouteId, optimizeMut, store]);

  const saveOrder = useCallback(async () => {
    if (!selectedRouteId || !isDirty) return;
    try {
      await reorderMut.mutateAsync({
        routeId: selectedRouteId,
        visits: localVisits.map((v) => ({ visitId: v.id, sequenceNumber: v.sequenceNumber })),
      });
      store.markClean();
      toast.success('Order saved');
    } catch (err) {
      toast.error(errMsg(err, 'Failed to save order'));
    }
  }, [selectedRouteId, isDirty, localVisits, reorderMut, store]);

  const deleteVisit = useCallback(
    async (visitId: string) => {
      if (!selectedRouteId) return;
      store.removeVisitLocally(visitId);
      try {
        await deleteVisitMut.mutateAsync({ visitId, routeId: selectedRouteId });
        toast.success('Stop removed');
      } catch (err) {
        toast.error(errMsg(err, 'Failed to remove stop'));
      }
    },
    [selectedRouteId, deleteVisitMut, store],
  );

  const createRoute = useCallback(
    async (driverId: string, scheduledDate: string) => {
      if (!user?.tenantId) return;
      try {
        const route = await createRouteMut.mutateAsync({ tenantId: user.tenantId, driverId, scheduledDate });
        store.setSelectedRoute(route.id, route.driverId);
        toast.success('Route created');
      } catch (err) {
        toast.error(errMsg(err, 'Failed to create route'));
      }
    },
    [user, createRouteMut, store],
  );

  return {
    addStops,
    optimize,
    saveOrder,
    deleteVisit,
    createRoute,
    isAdding: addVisitMut.isPending,
    isOptimizing: store.isOptimizing,
    isSaving: reorderMut.isPending,
    isCreating: createRouteMut.isPending,
  };
}
