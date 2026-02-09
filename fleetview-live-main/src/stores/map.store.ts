import { create } from 'zustand';
import type { EnrichedPosition } from '@/types/position.types';

interface MapState {
  positions: Record<string, EnrichedPosition>;
  selectedDriverId: string | null;
  selectedRouteId: string | null;
  followDriver: boolean;

  updatePosition: (position: EnrichedPosition) => void;
  selectDriver: (id: string | null) => void;
  selectRoute: (id: string | null) => void;
  toggleFollowDriver: () => void;
  clearPositions: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  positions: {},
  selectedDriverId: null,
  selectedRouteId: null,
  followDriver: false,

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

  clearPositions: () =>
    set({ positions: {}, selectedDriverId: null, selectedRouteId: null }),
}));
