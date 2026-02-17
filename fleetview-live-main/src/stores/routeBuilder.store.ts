import { create } from 'zustand';
import type { PlannedVisit } from '@/types/visit.types';
import type { Customer } from '@/types/customer.types';

export interface RouteBuilderState {
  // Selected route
  selectedRouteId: string | null;
  selectedDriverId: string | null;

  // Local visit order (for optimistic drag reorder)
  localVisits: PlannedVisit[];
  isDirty: boolean;

  // Optimization state
  isOptimizing: boolean;
  lastOptimizedAt: string | null;

  // UI
  addStopDialogOpen: boolean;
  createRouteDialogOpen: boolean;

  // Actions
  setSelectedRoute: (routeId: string | null, driverId?: string | null) => void;
  setLocalVisits: (visits: PlannedVisit[]) => void;
  reorderVisit: (fromIndex: number, toIndex: number) => void;
  addVisitLocally: (visit: PlannedVisit) => void;
  removeVisitLocally: (visitId: string) => void;
  setIsOptimizing: (val: boolean) => void;
  setLastOptimizedAt: (val: string | null) => void;
  markClean: () => void;
  setAddStopDialogOpen: (open: boolean) => void;
  setCreateRouteDialogOpen: (open: boolean) => void;
  reset: () => void;
}

export const useRouteBuilderStore = create<RouteBuilderState>((set) => ({
  selectedRouteId: null,
  selectedDriverId: null,
  localVisits: [],
  isDirty: false,
  isOptimizing: false,
  lastOptimizedAt: null,
  addStopDialogOpen: false,
  createRouteDialogOpen: false,

  setSelectedRoute: (routeId, driverId) =>
    set({
      selectedRouteId: routeId,
      selectedDriverId: driverId ?? null,
      localVisits: [],
      isDirty: false,
      lastOptimizedAt: null,
    }),

  setLocalVisits: (visits) =>
    set({ localVisits: [...visits].sort((a, b) => a.sequenceNumber - b.sequenceNumber) }),

  reorderVisit: (fromIndex, toIndex) =>
    set((state) => {
      const updated = [...state.localVisits];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      // Reassign sequence numbers
      const renumbered = updated.map((v, i) => ({
        ...v,
        sequenceNumber: i + 1,
      }));
      return { localVisits: renumbered, isDirty: true };
    }),

  addVisitLocally: (visit) =>
    set((state) => ({
      localVisits: [...state.localVisits, visit].sort(
        (a, b) => a.sequenceNumber - b.sequenceNumber,
      ),
    })),

  removeVisitLocally: (visitId) =>
    set((state) => {
      const filtered = state.localVisits.filter((v) => v.id !== visitId);
      const renumbered = filtered.map((v, i) => ({
        ...v,
        sequenceNumber: i + 1,
      }));
      return { localVisits: renumbered, isDirty: true };
    }),

  setIsOptimizing: (val) => set({ isOptimizing: val }),

  setLastOptimizedAt: (val) => set({ lastOptimizedAt: val }),

  markClean: () => set({ isDirty: false }),

  setAddStopDialogOpen: (open) => set({ addStopDialogOpen: open }),

  setCreateRouteDialogOpen: (open) => set({ createRouteDialogOpen: open }),

  reset: () =>
    set({
      selectedRouteId: null,
      selectedDriverId: null,
      localVisits: [],
      isDirty: false,
      isOptimizing: false,
      lastOptimizedAt: null,
      addStopDialogOpen: false,
      createRouteDialogOpen: false,
    }),
}));
