/**
 * MOCK DATA — Reports analytics.
 *
 * The backend is frontend-only for analytics: there are NO aggregation endpoints
 * for KPI trends, period comparisons, the day×hour heatmap, auto-insights, the
 * service-level breakdown, stop-duration histogram, or by-zone distances. These
 * are populated here with deterministic, clearly-labeled mock data so the page is
 * stable across renders. When real endpoints land, swap the corresponding hook
 * body in `hooks/api/useReports.ts` — the return shapes are designed to match.
 *
 * Values mirror the design handoff (`design_handoff_mission_control_pro/source/reports.jsx`).
 */

import { hashId } from './driverMock';

// ── KPI strip (MOCK) ───────────────────────────────────────
export type KpiDir = 'up' | 'down' | 'flat';

export interface ReportKpi {
  lbl: string;
  val: number;
  unit: string;
  delta: string;
  dir: KpiDir;
  spark: number[];
  /** vs-prev-period context line. */
  target: string;
}

export const REPORT_KPIS: ReportKpi[] = [
  { lbl: 'Visits',    val: 1284, unit: 'completed', delta: '+12.4', dir: 'up',   spark: [12, 18, 22, 19, 28, 32, 30, 36, 40, 38, 44, 46], target: 'Goal · 1,200' },
  { lbl: 'Distance',  val: 4128, unit: 'km',        delta: '+6.8',  dir: 'up',   spark: [120, 118, 140, 132, 152, 160, 148, 170, 180, 178, 188, 196], target: '+260 km vs last' },
  { lbl: 'On-time',   val: 91,   unit: '%',         delta: '-2.1',  dir: 'down', spark: [94, 93, 95, 92, 91, 93, 90, 89, 91, 92, 90, 91], target: 'Goal · 95%' },
  { lbl: 'Idle time', val: 14,   unit: 'h 22m',     delta: '-1.4',  dir: 'up',   spark: [18, 17, 15, 18, 16, 15, 14, 13, 15, 14, 13, 14], target: 'Lower is better' },
  { lbl: 'Avg speed', val: 34,   unit: 'km/h',      delta: '+0.4',  dir: 'flat', spark: [32, 33, 34, 33, 34, 35, 34, 33, 34, 35, 34, 34], target: 'Steady' },
  { lbl: 'Active',    val: 8,    unit: '/ 9',       delta: '+1',    dir: 'up',   spark: [6, 7, 7, 8, 8, 7, 8, 8, 7, 8, 8, 8], target: '1 vehicle off' },
];

// ── Visits & On-time trend (MOCK) ──────────────────────────
export const REPORT_TREND = {
  days: ['M', 'T', 'W', 'T', 'F', 'S', 'S', 'M', 'T', 'W', 'T', 'F', 'S', 'S'],
  visits: [28, 32, 38, 42, 45, 18, 14, 35, 38, 42, 48, 52, 22, 16],
  visitsPrev: [24, 28, 32, 38, 40, 16, 12, 30, 32, 38, 42, 46, 20, 14],
  otp: [92, 94, 93, 91, 88, 90, 89, 93, 95, 96, 94, 91, 90, 88],
  /** highlighted day (index) for the tooltip marker. */
  marker: { index: 11, label: 'FRI · 23 MAY', visits: 52, otp: 91 },
};

// ── Day × hour heatmap (MOCK) ──────────────────────────────
/** Visits-per-hour for day-of-week `d` (0=Mon) and hour `h` (0–23). */
export function heatmapValue(d: number, h: number): number {
  const base = Math.sin(h / 4) * 1.5 + Math.cos(d) * 0.8;
  const workBoost = h >= 8 && h <= 17 ? 6 : 0;
  const lunchDip = h === 12 || h === 13 ? -2 : 0;
  const weekendDip = d >= 5 ? -3 : 0;
  return Math.max(0, base + workBoost + lunchDip + weekendDip + 1.2);
}

// ── Auto-detected insights (MOCK) ──────────────────────────
export type InsightTone = 'warn' | 'good' | 'info';

export interface ReportInsight {
  tone: InsightTone;
  /** bold lead-in. */
  title: string;
  /** muted remainder (may contain a single highlighted `<num>`). */
  body: string;
  num?: string;
  cta: string;
}

export const REPORT_INSIGHTS: ReportInsight[] = [
  {
    tone: 'warn',
    title: 'On-time dropped',
    num: '2.1%',
    body: 'in the last 3 days. Largest contributor: traffic on Av. 6 de Agosto between 11:30–13:00.',
    cta: 'View routes',
  },
  {
    tone: 'good',
    title: 'Visits up +12.4% vs last period',
    body: '— exceeding the 1,200 visit goal by 84.',
    cta: 'Set new goal',
  },
  {
    tone: 'info',
    title: 'Roberto Mamani has been offline 3 days.',
    num: 'MNO-345',
    body: "Vehicle MNO-345 hasn't pinged since 22 May 08:14.",
    cta: 'Open driver',
  },
];

// ── Service level by outcome (MOCK) ────────────────────────
export interface ServiceLevelRow {
  lbl: string;
  ct: number;
  pct: number;
  cls: 'green' | 'amber' | 'red';
}

export const SERVICE_LEVEL: ServiceLevelRow[] = [
  { lbl: 'Completed on-time', ct: 1168, pct: 91, cls: 'green' },
  { lbl: 'Late but completed', ct: 84, pct: 6.5, cls: 'amber' },
  { lbl: 'Missed', ct: 24, pct: 1.9, cls: 'red' },
  { lbl: 'Cancelled', ct: 8, pct: 0.6, cls: 'red' },
];

// ── Stop-duration histogram (MOCK), buckets of 5 minutes ───
export const STOP_DURATION: number[] = [8, 22, 38, 56, 70, 62, 44, 30, 22, 18, 12, 8, 4, 2];

// ── By-zone distance (MOCK) ────────────────────────────────
export interface ZoneRow {
  lbl: string;
  v: number;
  p: number;
}

export const BY_ZONE: ZoneRow[] = [
  { lbl: 'Sopocachi', v: 1124, p: 0.86 },
  { lbl: 'Calacoto', v: 988, p: 0.76 },
  { lbl: 'San Miguel', v: 762, p: 0.58 },
  { lbl: 'Obrajes', v: 612, p: 0.47 },
  { lbl: 'Achumani', v: 446, p: 0.34 },
  { lbl: 'Miraflores', v: 196, p: 0.15 },
];

// ── Per-row mock derivations (used to enrich REAL data) ────

/**
 * MOCK on-time % for a route — the real `Route` entity has no on-time field.
 * Deterministic per id, biased high so most routes read as healthy.
 */
export function mockOnTimePct(id: string): number {
  return 70 + (hashId(id) % 29); // 70..98
}

const DELTAS = ['+8', '+12', '+4', '-3', '+6', '-8', '-12', '+2'];

/** MOCK period-over-period delta for a leaderboard row (no prev-period query). */
export function mockDelta(id: string): { delta: string; dir: 'up' | 'down' } {
  const d = DELTAS[hashId(id) % DELTAS.length];
  return { delta: d, dir: d.startsWith('-') ? 'down' : 'up' };
}

/** MOCK speed trace (km/h, ~25 readings) for the drilldown sparkline. */
export function mockSpeedSeries(id: string, points = 25): number[] {
  const h = hashId(id);
  return Array.from({ length: points }, (_, i) =>
    Math.max(0, Math.round(36 + 34 * Math.sin((i + h) / 3.2) + ((h >> (i % 5)) & 7) - 4)),
  );
}

// ── Handoff sample rows — used only as a labeled fallback when the
//    real history endpoints return nothing (e.g. backend not seeded). ──
export interface MockRouteRow {
  date: string;
  driver: string;
  drvCls: 'green' | 'amber' | 'red';
  plate: string;
  stops: string;
  dist: number;
  dur: string;
  otp: number;
  status: 'completed' | 'late' | 'missed';
}

export const FALLBACK_ROUTES: MockRouteRow[] = [
  { date: '25 May', driver: 'Ana Torres', drvCls: 'green', plate: 'JKL-012', stops: '10/10', dist: 56.4, dur: '7h 12m', otp: 96, status: 'completed' },
  { date: '25 May', driver: 'Juan Pérez', drvCls: 'green', plate: 'BCD-890', stops: '9/10', dist: 48.2, dur: '6h 48m', otp: 92, status: 'completed' },
  { date: '25 May', driver: 'Mateo Gutiérrez', drvCls: 'green', plate: 'YZA-567', stops: '8/9', dist: 41.8, dur: '6h 20m', otp: 88, status: 'late' },
  { date: '25 May', driver: 'Carlos López', drvCls: 'amber', plate: 'GHI-789', stops: '5/10', dist: 22.4, dur: '4h 02m', otp: 64, status: 'late' },
  { date: '25 May', driver: 'Roberto Mamani', drvCls: 'red', plate: 'MNO-345', stops: '0/8', dist: 0, dur: '—', otp: 0, status: 'missed' },
  { date: '25 May', driver: 'Lucia Quispe', drvCls: 'green', plate: 'PQR-678', stops: '10/10', dist: 52.1, dur: '7h 04m', otp: 94, status: 'completed' },
  { date: '24 May', driver: 'Ana Torres', drvCls: 'green', plate: 'JKL-012', stops: '10/10', dist: 58.2, dur: '7h 30m', otp: 98, status: 'completed' },
  { date: '24 May', driver: 'Diego Flores', drvCls: 'amber', plate: 'STU-901', stops: '7/10', dist: 34.7, dur: '5h 18m', otp: 76, status: 'late' },
  { date: '24 May', driver: 'Sofia Condori', drvCls: 'green', plate: 'VWX-234', stops: '8/8', dist: 44.0, dur: '6h 22m', otp: 92, status: 'completed' },
  { date: '24 May', driver: 'Mateo Gutiérrez', drvCls: 'green', plate: 'YZA-567', stops: '9/9', dist: 46.8, dur: '6h 40m', otp: 89, status: 'completed' },
  { date: '24 May', driver: 'Juan Pérez', drvCls: 'green', plate: 'BCD-890', stops: '8/10', dist: 42.1, dur: '6h 02m', otp: 84, status: 'late' },
  { date: '23 May', driver: 'Lucia Quispe', drvCls: 'green', plate: 'PQR-678', stops: '10/10', dist: 51.6, dur: '7h 18m', otp: 96, status: 'completed' },
  { date: '23 May', driver: 'Ana Torres', drvCls: 'green', plate: 'JKL-012', stops: '10/10', dist: 60.4, dur: '7h 42m', otp: 98, status: 'completed' },
  { date: '23 May', driver: 'Carlos López', drvCls: 'amber', plate: 'GHI-789', stops: '6/10', dist: 28.4, dur: '4h 58m', otp: 72, status: 'late' },
  { date: '23 May', driver: 'Sofia Condori', drvCls: 'green', plate: 'VWX-234', stops: '8/8', dist: 42.8, dur: '6h 12m', otp: 94, status: 'completed' },
];

export interface MockDriverLb {
  name: string;
  initials: string;
  visits: number;
  otp: number;
  km: number;
  delta: string;
  dir: 'up' | 'down';
}

export const FALLBACK_DRIVERS_LB: MockDriverLb[] = [
  { name: 'Ana Torres', initials: 'AT', visits: 286, otp: 96, km: 612, delta: '+8', dir: 'up' },
  { name: 'Juan Pérez', initials: 'JP', visits: 248, otp: 94, km: 540, delta: '+12', dir: 'up' },
  { name: 'Mateo Gutiérrez', initials: 'MG', visits: 224, otp: 91, km: 498, delta: '+4', dir: 'up' },
  { name: 'Lucia Quispe', initials: 'LQ', visits: 202, otp: 89, km: 446, delta: '-3', dir: 'down' },
  { name: 'Sofia Condori', initials: 'SC', visits: 188, otp: 92, km: 421, delta: '+6', dir: 'up' },
  { name: 'Carlos López', initials: 'CL', visits: 142, otp: 84, km: 318, delta: '-8', dir: 'down' },
  { name: 'Diego Flores', initials: 'DF', visits: 98, otp: 78, km: 226, delta: '-12', dir: 'down' },
];
