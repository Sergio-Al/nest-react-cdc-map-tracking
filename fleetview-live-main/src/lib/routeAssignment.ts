import type { Route } from '@/types/route.types';

/**
 * Driver IDs that already own a (non-cancelled) route on `date`.
 * Pass `exceptRouteId` to ignore the route currently being edited so its own
 * driver isn't flagged as a conflict against itself.
 */
export function busyDriverIds(
  routes: Route[],
  date: string | undefined,
  exceptRouteId?: string | null,
): Set<string> {
  if (!date) return new Set();
  return new Set(
    routes
      .filter(
        (r) => r.scheduledDate === date && r.status !== 'cancelled' && r.id !== exceptRouteId,
      )
      .map((r) => r.driverId),
  );
}
