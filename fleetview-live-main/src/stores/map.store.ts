import { create } from 'zustand';
import type { EnrichedPosition } from '@/types/position.types';

interface MapState {
  positions: Record<string, EnrichedPosition>;
  selectedDriverId: string | null;
  selectedRouteId: string | null;
  followDriver: boolean;
  /** Bumped to re-fly the map to the selected driver (e.g. the "F" hotkey / Track). */
  mapFocusTick: number;

  updatePosition: (position: EnrichedPosition) => void;
  selectDriver: (id: string | null) => void;
  selectRoute: (id: string | null) => void;
  toggleFollowDriver: () => void;
  setFollowDriver: (follow: boolean) => void;
  focusSelected: () => void;
  clearPositions: () => void;
}

// Incoming WS position updates are coalesced here and flushed to the store on a
// short interval. At 1,000 drivers reporting ~every 5s (~200 msg/s) a per-message
// `set` would trigger ~200 store-subscriber render cascades/second; batching
// collapses that to ~1000/FLUSH_MS, i.e. a few renders/second. The cost is up to
// FLUSH_MS of display latency, which is imperceptible for live tracking.
const FLUSH_MS = 300;
const positionBuffer = new Map<string, EnrichedPosition>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export const useMapStore = create<MapState>((set) => {
  const flushPositions = () => {
    flushTimer = null;
    if (positionBuffer.size === 0) return;
    set((state) => {
      const positions = { ...state.positions };
      positionBuffer.forEach((pos, id) => {
        positions[id] = pos;
      });
      positionBuffer.clear();
      return { positions };
    });
  };

  return {
    positions: {},
    selectedDriverId: null,
    selectedRouteId: null,
    followDriver: false,
    mapFocusTick: 0,

    updatePosition: (position) => {
      // Keep only the latest position per driver until the next flush.
      positionBuffer.set(position.driverId, position);
      if (!flushTimer) flushTimer = setTimeout(flushPositions, FLUSH_MS);
    },

    selectDriver: (id) => set({ selectedDriverId: id }),

    selectRoute: (id) => set({ selectedRouteId: id }),

    toggleFollowDriver: () =>
      set((state) => ({ followDriver: !state.followDriver })),

    setFollowDriver: (follow) => set({ followDriver: follow }),

    focusSelected: () => set((state) => ({ mapFocusTick: state.mapFocusTick + 1 })),

    clearPositions: () => {
      positionBuffer.clear();
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      set({ positions: {}, selectedDriverId: null, selectedRouteId: null });
    },
  };
});
