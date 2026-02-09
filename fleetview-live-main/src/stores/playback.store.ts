import { create } from 'zustand';
import type { HistoryPosition } from '@/types/history.types';

export type PlaybackSpeed = 1 | 2 | 4 | 8 | 16;

interface PlaybackState {
  // Data
  positions: HistoryPosition[];
  currentIndex: number;

  // Playback controls
  isPlaying: boolean;
  speed: PlaybackSpeed;

  // Query params
  selectedDriverId: string | null;
  selectedRouteId: string | null;
  mode: 'driver' | 'route';
  dateFrom: string | null;
  dateTo: string | null;

  // Actions
  setPositions: (positions: HistoryPosition[]) => void;
  setCurrentIndex: (index: number) => void;
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  stepForward: () => void;
  stepBackward: () => void;
  goToStart: () => void;
  goToEnd: () => void;
  setMode: (mode: 'driver' | 'route') => void;
  setSelectedDriverId: (id: string | null) => void;
  setSelectedRouteId: (id: string | null) => void;
  setDateRange: (from: string | null, to: string | null) => void;
  reset: () => void;
}

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  positions: [],
  currentIndex: 0,
  isPlaying: false,
  speed: 1,
  selectedDriverId: null,
  selectedRouteId: null,
  mode: 'driver',
  dateFrom: null,
  dateTo: null,

  setPositions: (positions) =>
    set({ positions, currentIndex: 0, isPlaying: false }),

  setCurrentIndex: (index) => {
    const { positions } = get();
    if (index >= 0 && index < positions.length) {
      set({ currentIndex: index });
    }
  },

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),

  togglePlayback: () => {
    const { isPlaying, currentIndex, positions } = get();
    // If at the end, restart from beginning
    if (!isPlaying && currentIndex >= positions.length - 1) {
      set({ currentIndex: 0, isPlaying: true });
    } else {
      set({ isPlaying: !isPlaying });
    }
  },

  setSpeed: (speed) => set({ speed }),

  stepForward: () => {
    const { currentIndex, positions } = get();
    if (currentIndex < positions.length - 1) {
      set({ currentIndex: currentIndex + 1, isPlaying: false });
    }
  },

  stepBackward: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1, isPlaying: false });
    }
  },

  goToStart: () => set({ currentIndex: 0, isPlaying: false }),

  goToEnd: () => {
    const { positions } = get();
    set({ currentIndex: Math.max(0, positions.length - 1), isPlaying: false });
  },

  setMode: (mode) => set({ mode }),

  setSelectedDriverId: (id) =>
    set({ selectedDriverId: id, positions: [], currentIndex: 0, isPlaying: false }),

  setSelectedRouteId: (id) =>
    set({ selectedRouteId: id, positions: [], currentIndex: 0, isPlaying: false }),

  setDateRange: (from, to) =>
    set({ dateFrom: from, dateTo: to, positions: [], currentIndex: 0, isPlaying: false }),

  reset: () =>
    set({
      positions: [],
      currentIndex: 0,
      isPlaying: false,
      speed: 1,
      selectedDriverId: null,
      selectedRouteId: null,
      dateFrom: null,
      dateTo: null,
    }),
}));
