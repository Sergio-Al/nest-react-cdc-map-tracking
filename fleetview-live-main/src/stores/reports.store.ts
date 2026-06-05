import { create } from 'zustand';
import { useAuthStore } from '@/stores/auth.store';
import { presetRange, getUserTimezone } from '@/lib/datetime';
import type { DatePreset } from '@/lib/datetime';

export type ReportTab =
  | 'overview'
  | 'routes'
  | 'visits'
  | 'drivers'
  | 'vehicles'
  | 'customers'
  | 'fuel'
  | 'safety';

// DatePreset and presetRange now live in '@/lib/datetime' (timezone-aware);
// re-exported here so existing import sites keep working.
export type { DatePreset };
export { presetRange };

export type Grain = 'hour' | 'day' | 'week' | 'month';

export type CompareMode = 'previous_period' | 'previous_year' | 'none';

export const COMPARE_LABELS: Record<CompareMode, string> = {
  previous_period: 'previous period',
  previous_year: 'previous year',
  none: 'no comparison',
};

interface ReportsState {
  tab: ReportTab;
  preset: DatePreset;
  from: string;
  to: string;
  grain: Grain;
  compare: CompareMode;
  /** The active tab registers a CSV exporter here; the header Export button runs it. */
  exporter: (() => void) | null;
  setTab: (tab: ReportTab) => void;
  setPreset: (preset: DatePreset) => void;
  setRange: (from: string, to: string) => void;
  setGrain: (grain: Grain) => void;
  setCompare: (compare: CompareMode) => void;
  setExporter: (fn: (() => void) | null) => void;
}

// Seed from the (persisted) user's default preset + timezone, falling back to
// 14d / system tz before login.
const initialPreset = (useAuthStore.getState().settings?.defaultReportPreset as DatePreset) || '14d';
const initial = presetRange(initialPreset, getUserTimezone());

export const useReportsStore = create<ReportsState>((set) => ({
  tab: 'overview',
  preset: initialPreset,
  from: initial.from,
  to: initial.to,
  grain: 'day',
  compare: 'previous_period',
  exporter: null,
  setTab: (tab) => set({ tab }),
  setPreset: (preset) => set({ preset, ...presetRange(preset, getUserTimezone()) }),
  setRange: (from, to) => set({ from, to, preset: 'custom' }),
  setGrain: (grain) => set({ grain }),
  setCompare: (compare) => set({ compare }),
  setExporter: (exporter) => set({ exporter }),
}));
