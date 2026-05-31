import { create } from 'zustand';

export type ReportTab =
  | 'overview'
  | 'routes'
  | 'visits'
  | 'drivers'
  | 'vehicles'
  | 'customers'
  | 'fuel'
  | 'safety';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | '7d'
  | '14d'
  | '30d'
  | 'mtd'
  | 'qtd'
  | 'ytd'
  /** Set when a custom range is picked from the calendar (no preset highlighted). */
  | 'custom';

export type Grain = 'hour' | 'day' | 'week' | 'month';

export type CompareMode = 'previous_period' | 'previous_year' | 'none';

export const COMPARE_LABELS: Record<CompareMode, string> = {
  previous_period: 'previous period',
  previous_year: 'previous year',
  none: 'no comparison',
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Resolve a preset to a [from, to] yyyy-mm-dd range relative to today. */
export function presetRange(preset: DatePreset): { from: string; to: string } {
  const start = new Date();
  const end = new Date();
  switch (preset) {
    case 'today':
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case '7d':
      start.setDate(start.getDate() - 6);
      break;
    case '14d':
      start.setDate(start.getDate() - 13);
      break;
    case '30d':
      start.setDate(start.getDate() - 29);
      break;
    case 'mtd':
      start.setDate(1);
      break;
    case 'qtd':
      start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
      break;
    case 'ytd':
      start.setMonth(0, 1);
      break;
  }
  return { from: iso(start), to: iso(end) };
}

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

const initial = presetRange('14d');

export const useReportsStore = create<ReportsState>((set) => ({
  tab: 'overview',
  preset: '14d',
  from: initial.from,
  to: initial.to,
  grain: 'day',
  compare: 'previous_period',
  exporter: null,
  setTab: (tab) => set({ tab }),
  setPreset: (preset) => set({ preset, ...presetRange(preset) }),
  setRange: (from, to) => set({ from, to, preset: 'custom' }),
  setGrain: (grain) => set({ grain }),
  setCompare: (compare) => set({ compare }),
  setExporter: (exporter) => set({ exporter }),
}));
