import { queryClient } from '@/lib/queryClient';
import { useRouteBuilderStore } from '@/stores/routeBuilder.store';
import { usePlaybackStore } from '@/stores/playback.store';
import { useMapStore } from '@/stores/map.store';

/**
 * Drops every scrap of per-session client state.
 *
 * Logging out is a client-side navigation, not a page reload, so the non-persisted
 * Zustand stores and the React Query cache survive it. Without this the next login
 * inherits the previous session's state — most visibly, `/routes` reopening the
 * builder on a route id belonging to the tenant you just left, whose PATCH then
 * 404s because the backend scopes lookups by the JWT's tenant.
 *
 * Called from both `logout()` and `clearAuth()` (the 401-driven teardown).
 */
export function resetSessionState() {
  useRouteBuilderStore.getState().reset();
  usePlaybackStore.getState().reset();

  const map = useMapStore.getState();
  map.clearPositions();
  map.selectDriver(null);
  map.selectRoute(null);
  map.setFollowDriver(false);

  // Cached rows are tenant-scoped; keeping them would flash the old tenant's
  // customers/drivers/routes into the new session before the refetch lands.
  queryClient.clear();
}
