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

export const useMapStore = create<MapState>((set) => ({
  positions: {},
  selectedDriverId: null,
  selectedRouteId: null,
  followDriver: false,
  mapFocusTick: 0,

  updatePosition: (position) =>
    set((state) => ({
      positions: {
        ...state.positions,
        [position.driverId]: position,
      },
    })),

  selectDriver: (id) =>
    set({ selectedDriverId: id }),

  selectRoute: (id) =>
    set({ selectedRouteId: id }),

  toggleFollowDriver: () =>
    set((state) => ({ followDriver: !state.followDriver })),

  setFollowDriver: (follow) => set({ followDriver: follow }),

  focusSelected: () => set((state) => ({ mapFocusTick: state.mapFocusTick + 1 })),

  clearPositions: () =>
    set({ positions: {}, selectedDriverId: null, selectedRouteId: null }),
}));
