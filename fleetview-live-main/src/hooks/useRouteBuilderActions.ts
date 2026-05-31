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
        toast.success(t('toasts.stopsAdded', { count: customerIds.length }));
      } catch (err) {
        toast.error(errMsg(err, t('toasts.addFailed')));
      }
    },
    [selectedRouteId, selectedDriverId, user, selectedRoute, localVisits.length, addVisitMut, t],
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
