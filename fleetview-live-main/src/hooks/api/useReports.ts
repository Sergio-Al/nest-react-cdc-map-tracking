/**
 * Reports data hooks.
 *
 * Two kinds of hooks live here:
 *  1. MOCK-backed seams (`useReportKpis`, `useReportTrend`, …) — analytics that
 *     have no backend aggregation endpoint. They return the labeled mock data in
 *     `lib/mock/reportsMock.ts`. Swap each body to a `useQuery(GET /reports/…)`
 *     when the endpoint exists; the shapes already match.
 *  2. REAL-derived hooks (`useRouteReport`, `useDriverLeaderboard`,
 *     `useRouteDrilldown`) — built on the existing history / entity hooks. These
 *     fall back to labeled mock only when the backend returns nothing (so the
 *     demo never looks broken); callers can read the `isMock` flag.
 */

import { useMemo } from 'react';
import {
  useRoutesByDateRange,
  useVisitCompletions,
  useDriverDailyStats,
} from './useHistory';
import { useDrivers } from './useDrivers';
import { useRouteWithVisits, useRouteVisits, useCustomers } from './useRouteBuilder';
import type { Route } from '@/types/route.types';
import type { CompareMode } from '@/stores/reports.store';
import type {
  KpiDir,
  ReportKpi,
  ServiceLevelRow,
  ZoneRow,
} from '@/lib/mock/reportsMock';
import {
  REPORT_KPIS,
  REPORT_TREND,
  REPORT_INSIGHTS,
  SERVICE_LEVEL,
  STOP_DURATION,
  BY_ZONE,
  FALLBACK_ROUTES,
  FALLBACK_DRIVERS_LB,
  mockOnTimePct,
  mockDelta,
  mockSpeedSeries,
  heatmapValue,
} from '@/lib/mock/reportsMock';

// ─── helpers ───────────────────────────────────────────────
export function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const pad = (n: number) => String(n).padStart(2, '0');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function fmtDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`;
}

/** "HH:MM" from an ISO datetime, or null if not parseable. */
function safeHhmm(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type AvatarTone = 'green' | 'amber' | 'red';

function toneFor(onTimePct: number): AvatarTone {
  if (onTimePct === 0) return 'red';
  if (onTimePct >= 90) return 'green';
  if (onTimePct >= 80) return 'amber';
  return 'red';
}

// ─── still-mock seam (no backing data) ─────────────────────
// Insights need anomaly detection that no endpoint exposes — stays labeled mock
// (callers render a "demo data" badge).
export const useReportInsights = () => REPORT_INSIGHTS;

// ─── By-zone visits (REAL, mock fallback) ──────────────────
export interface ByZoneResult {
  rows: ZoneRow[];
  isMock: boolean;
  isLoading: boolean;
}

/**
 * Completed visits bucketed by the customer's stored `zone`. Each visit links
 * to a `customerId`; we resolve it to that customer's neighborhood and count.
 * Bars scale to the busiest zone (`p = count / max`); the top 6 are shown.
 * Visits whose customer has no zone are skipped. Falls back to labeled mock when
 * nothing lands in the range (so the demo never looks broken).
 */
export function useByZone(from: string, to: string): ByZoneResult {
  const visitsQ = useVisitCompletions(from, to);
  const { data: customers = [] } = useCustomers();
  const isLoading = visitsQ.isLoading;

  return useMemo<ByZoneResult>(() => {
    const visits = (visitsQ.data ?? []) as Array<{ customerId: number; status: string }>;
    const zoneOf = new Map<number, string | null>(
      customers.map((c) => [c.id, c.zone ?? null]),
    );

    const counts = new Map<string, number>();
    for (const v of visits) {
      if (!isCompleted(v.status)) continue;
      const zone = zoneOf.get(v.customerId);
      if (!zone) continue;
      counts.set(zone, (counts.get(zone) ?? 0) + 1);
    }

    if (counts.size === 0) return { rows: BY_ZONE, isMock: !isLoading, isLoading };

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = sorted[0][1] || 1;
    const rows: ZoneRow[] = sorted.map(([lbl, v]) => ({ lbl, v, p: v / max }));
    return { rows, isMock: false, isLoading };
  }, [visitsQ.data, customers, isLoading]);
}

// ─── date helpers (tz-safe, yyyy-mm-dd) ────────────────────
function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Inclusive list of yyyy-mm-dd day keys spanning [from,to] (capped to 92). */
function dayKeys(from: string, to: string): string[] {
  const end = parseYmd(to);
  const cur = parseYmd(from);
  const out: string[] = [];
  while (cur <= end && out.length < 92) {
    out.push(toYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out.length ? out : [from];
}
/** yyyy-mm-dd (local) for an ISO timestamp, or '' if unparseable. */
function dayOfTs(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : toYmd(d);
}
/** Previous comparison range, or null when compare === 'none'. */
function prevRange(
  from: string,
  to: string,
  compare: CompareMode,
): { from: string; to: string } | null {
  if (compare === 'none') return null;
  const start = parseYmd(from);
  const end = parseYmd(to);
  if (compare === 'previous_year') {
    const s = new Date(start);
    s.setFullYear(s.getFullYear() - 1);
    const e = new Date(end);
    e.setFullYear(e.getFullYear() - 1);
    return { from: toYmd(s), to: toYmd(e) };
  }
  // previous_period: shift back by the inclusive span length.
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const s = new Date(start);
  s.setDate(s.getDate() - spanDays);
  const e = new Date(start);
  e.setDate(e.getDate() - 1);
  return { from: toYmd(s), to: toYmd(e) };
}

const WD_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WD3 = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** A completion counts as "completed" when the backend marked it so. */
function isCompleted(status: string): boolean {
  return status === 'completed';
}
function isMissed(status: string): boolean {
  return status === 'skipped' || status === 'failed' || status === 'missed';
}

interface VisitRowLite {
  time: string;
  status: string;
  onTime: boolean;
  durationSec: number | null;
}
interface StatRowLite {
  bucket: string;
  driverId: string;
  positionCount: number;
  avgSpeed: number;
  movingRatio: number;
}

/** Period-level aggregate over the three raw datasets. */
function aggregatePeriod(
  visits: VisitRowLite[],
  routes: Route[],
  stats: StatRowLite[],
) {
  let completed = 0;
  let onTime = 0;
  for (const v of visits) {
    if (isCompleted(v.status)) {
      completed += 1;
      if (v.onTime) onTime += 1;
    }
  }
  let distanceKm = 0;
  for (const r of routes) {
    if (r.totalDistanceMeters) distanceKm += r.totalDistanceMeters / 1000;
  }
  let idleSum = 0;
  let speedSum = 0;
  let statN = 0;
  const drivers = new Set<string>();
  for (const s of stats) {
    statN += 1;
    idleSum += 1 - (s.movingRatio ?? 0);
    speedSum += s.avgSpeed ?? 0;
    if ((s.positionCount ?? 0) > 0) drivers.add(s.driverId);
  }
  return {
    visits: completed,
    distanceKm,
    onTimePct: completed ? (onTime / completed) * 100 : 0,
    idlePct: statN ? (idleSum / statN) * 100 : 0,
    avgSpeed: statN ? speedSum / statN : 0,
    active: drivers.size,
    empty: visits.length === 0 && routes.length === 0 && stats.length === 0,
  };
}

/** Signed percent-change string + good/bad direction for the KPI chip. */
function fmtDelta(cur: number, prev: number | null, lowerBetter = false): { delta: string; dir: KpiDir } {
  if (prev === null) return { delta: '—', dir: 'flat' };
  if (prev === 0) {
    if (cur === 0) return { delta: '0', dir: 'flat' };
    return { delta: '+100', dir: lowerBetter ? 'down' : 'up' };
  }
  const change = ((cur - prev) / prev) * 100;
  const rounded = Math.abs(change) < 0.05 ? 0 : change;
  const delta = `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
  let dir: KpiDir = 'flat';
  if (rounded !== 0) {
    const better = lowerBetter ? rounded < 0 : rounded > 0;
    dir = better ? 'up' : 'down';
  }
  return { delta, dir };
}

// ─── KPI strip (REAL, mock fallback) ───────────────────────
export interface KpiResult {
  kpis: ReportKpi[];
  isMock: boolean;
  isLoading: boolean;
}

export function useReportKpis(from: string, to: string, compare: CompareMode): KpiResult {
  const visitsQ = useVisitCompletions(from, to);
  const routesQ = useRoutesByDateRange(from, to);
  const statsQ = useDriverDailyStats(from, to);
  const { data: drivers = [] } = useDrivers();

  const prev = prevRange(from, to, compare);
  const pVisitsQ = useVisitCompletions(prev?.from ?? null, prev?.to ?? null);
  const pRoutesQ = useRoutesByDateRange(prev?.from ?? null, prev?.to ?? null);
  const pStatsQ = useDriverDailyStats(prev?.from ?? null, prev?.to ?? null);

  const isLoading = visitsQ.isLoading || routesQ.isLoading || statsQ.isLoading;

  return useMemo<KpiResult>(() => {
    const visits = (visitsQ.data ?? []) as VisitRowLite[];
    const routes = routesQ.data ?? [];
    const stats = (statsQ.data ?? []) as StatRowLite[];
    const cur = aggregatePeriod(visits, routes, stats);
    if (cur.empty) return { kpis: REPORT_KPIS, isMock: !isLoading, isLoading };

    const hasPrev = prev !== null;
    const p = hasPrev
      ? aggregatePeriod(
          (pVisitsQ.data ?? []) as VisitRowLite[],
          pRoutesQ.data ?? [],
          (pStatsQ.data ?? []) as StatRowLite[],
        )
      : null;
    const pv = (sel: (a: typeof cur) => number) => (p ? sel(p) : null);

    // Per-day series for the sparklines, aligned to the range.
    const keys = dayKeys(from, to);
    const idx = new Map(keys.map((k, i) => [k, i]));
    const series = () => keys.map(() => 0);
    const sVisits = series();
    const sDist = series();
    const sOtAll = series();
    const sOtOk = series();
    const sIdleSum = series();
    const sIdleN = series();
    const sSpeedSum = series();
    const sSpeedN = series();
    const sDrivers: Set<string>[] = keys.map(() => new Set());

    for (const v of visits) {
      const i = idx.get(dayOfTs(v.time));
      if (i === undefined || !isCompleted(v.status)) continue;
      sVisits[i] += 1;
      sOtAll[i] += 1;
      if (v.onTime) sOtOk[i] += 1;
    }
    for (const r of routes) {
      const i = idx.get(dayOfTs(r.scheduledDate));
      if (i === undefined || !r.totalDistanceMeters) continue;
      sDist[i] += r.totalDistanceMeters / 1000;
    }
    for (const s of stats) {
      const i = idx.get(dayOfTs(s.bucket));
      if (i === undefined) continue;
      sIdleSum[i] += 1 - (s.movingRatio ?? 0);
      sIdleN[i] += 1;
      sSpeedSum[i] += s.avgSpeed ?? 0;
      sSpeedN[i] += 1;
      if ((s.positionCount ?? 0) > 0) sDrivers[i].add(s.driverId);
    }

    const sparkOt = keys.map((_, i) => (sOtAll[i] ? Math.round((sOtOk[i] / sOtAll[i]) * 100) : 0));
    const sparkIdle = keys.map((_, i) => (sIdleN[i] ? Math.round((sIdleSum[i] / sIdleN[i]) * 100) : 0));
    const sparkSpeed = keys.map((_, i) => (sSpeedN[i] ? Math.round(sSpeedSum[i] / sSpeedN[i]) : 0));
    const sparkActive = sDrivers.map((s) => s.size);

    const totalDrivers = Math.max(drivers.length, cur.active);

    const kpis: ReportKpi[] = [
      {
        lbl: 'Visits',
        val: cur.visits,
        unit: 'completed',
        ...fmtDelta(cur.visits, pv((a) => a.visits)),
        spark: sVisits,
        target: REPORT_KPIS[0].target,
      },
      {
        lbl: 'Distance',
        val: Math.round(cur.distanceKm),
        unit: 'km',
        ...fmtDelta(cur.distanceKm, pv((a) => a.distanceKm)),
        spark: sDist.map((v) => Math.round(v)),
        target: REPORT_KPIS[1].target,
      },
      {
        lbl: 'On-time',
        val: Math.round(cur.onTimePct),
        unit: '%',
        ...fmtDelta(cur.onTimePct, pv((a) => a.onTimePct)),
        spark: sparkOt,
        target: REPORT_KPIS[2].target,
      },
      {
        lbl: 'Idle time',
        val: Math.round(cur.idlePct),
        unit: '%',
        ...fmtDelta(cur.idlePct, pv((a) => a.idlePct), true),
        spark: sparkIdle,
        target: REPORT_KPIS[3].target,
      },
      {
        lbl: 'Avg speed',
        val: Math.round(cur.avgSpeed),
        unit: 'km/h',
        ...fmtDelta(cur.avgSpeed, pv((a) => a.avgSpeed)),
        spark: sparkSpeed,
        target: REPORT_KPIS[4].target,
      },
      {
        lbl: 'Active',
        val: cur.active,
        unit: `/ ${totalDrivers}`,
        ...fmtDelta(cur.active, pv((a) => a.active)),
        spark: sparkActive,
        target: REPORT_KPIS[5].target,
      },
    ];
    return { kpis, isMock: false, isLoading };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visitsQ.data,
    routesQ.data,
    statsQ.data,
    pVisitsQ.data,
    pRoutesQ.data,
    pStatsQ.data,
    drivers,
    from,
    to,
    compare,
    isLoading,
  ]);
}

// ─── Visits & on-time trend (REAL, mock fallback) ──────────
export interface TrendData {
  days: string[];
  visits: number[];
  visitsPrev: number[];
  otp: number[];
  marker: { index: number; label: string; visits: number; otp: number };
}
export interface TrendResult {
  trend: TrendData;
  isMock: boolean;
  isLoading: boolean;
}

/** Per-day [completed-count, on-time%] aligned to `keys`. */
function visitsPerDay(visits: VisitRowLite[], keys: string[]): { count: number[]; otp: number[] } {
  const idx = new Map(keys.map((k, i) => [k, i]));
  const count = keys.map(() => 0);
  const ok = keys.map(() => 0);
  for (const v of visits) {
    const i = idx.get(dayOfTs(v.time));
    if (i === undefined || !isCompleted(v.status)) continue;
    count[i] += 1;
    if (v.onTime) ok[i] += 1;
  }
  const otp = keys.map((_, i) => (count[i] ? Math.round((ok[i] / count[i]) * 100) : 0));
  return { count, otp };
}

export function useReportTrend(from: string, to: string, compare: CompareMode): TrendResult {
  const visitsQ = useVisitCompletions(from, to);
  const prev = prevRange(from, to, compare);
  const pVisitsQ = useVisitCompletions(prev?.from ?? null, prev?.to ?? null);
  const isLoading = visitsQ.isLoading;

  return useMemo<TrendResult>(() => {
    const visits = (visitsQ.data ?? []) as VisitRowLite[];
    if (visits.length === 0) return { trend: REPORT_TREND, isMock: !isLoading, isLoading };

    const keys = dayKeys(from, to);
    const { count, otp } = visitsPerDay(visits, keys);

    let visitsPrev = keys.map(() => 0);
    if (prev) {
      const pKeys = dayKeys(prev.from, prev.to);
      const pCount = visitsPerDay((pVisitsQ.data ?? []) as VisitRowLite[], pKeys).count;
      // Align prev by position so the dashed line overlays the current series.
      visitsPrev = keys.map((_, i) => pCount[i] ?? 0);
    }

    const days = keys.map((k) => WD_LETTER[parseYmd(k).getDay()]);
    let mi = 0;
    for (let i = 1; i < count.length; i++) if (count[i] > count[mi]) mi = i;
    const md = parseYmd(keys[mi]);
    const marker = {
      index: mi,
      label: `${WD3[md.getDay()]} · ${md.getDate()} ${MONTHS[md.getMonth()].toUpperCase()}`,
      visits: count[mi],
      otp: otp[mi],
    };

    return { trend: { days, visits: count, visitsPrev, otp, marker }, isMock: false, isLoading };
  }, [visitsQ.data, pVisitsQ.data, from, to, prev, isLoading]);
}

// ─── Day × hour heatmap (REAL, mock fallback) ──────────────
export interface HeatmapResult {
  values: number[][]; // [weekday 0=Mon][hour 0-23]
  max: number;
  isMock: boolean;
  isLoading: boolean;
}

export function useReportHeatmap(from: string, to: string): HeatmapResult {
  const visitsQ = useVisitCompletions(from, to);
  const isLoading = visitsQ.isLoading;

  return useMemo<HeatmapResult>(() => {
    const visits = (visitsQ.data ?? []) as VisitRowLite[];
    const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    let max = 0;
    let any = false;
    for (const v of visits) {
      if (!isCompleted(v.status)) continue;
      const d = new Date(v.time);
      if (Number.isNaN(d.getTime())) continue;
      any = true;
      const wd = (d.getDay() + 6) % 7; // Mon=0
      const h = d.getHours();
      grid[wd][h] += 1;
      if (grid[wd][h] > max) max = grid[wd][h];
    }
    if (!any) {
      const mock: number[][] = Array.from({ length: 7 }, (_, d) =>
        Array.from({ length: 24 }, (_, h) => heatmapValue(d, h)),
      );
      return { values: mock, max: 8, isMock: !isLoading, isLoading };
    }
    return { values: grid, max: Math.max(max, 1), isMock: false, isLoading };
  }, [visitsQ.data, isLoading]);
}

// ─── Service level (REAL, mock fallback) ───────────────────
export interface ServiceLevelResult {
  rows: ServiceLevelRow[];
  isMock: boolean;
  isLoading: boolean;
}

export function useServiceLevel(from: string, to: string): ServiceLevelResult {
  const visitsQ = useVisitCompletions(from, to);
  const isLoading = visitsQ.isLoading;

  return useMemo<ServiceLevelResult>(() => {
    const visits = (visitsQ.data ?? []) as VisitRowLite[];
    if (visits.length === 0) return { rows: SERVICE_LEVEL, isMock: !isLoading, isLoading };

    let onTime = 0;
    let late = 0;
    let missed = 0;
    let cancelled = 0;
    for (const v of visits) {
      if (isCompleted(v.status)) {
        if (v.onTime) onTime++;
        else late++;
      } else if (v.status === 'cancelled') cancelled++;
      else if (isMissed(v.status)) missed++;
    }
    const total = onTime + late + missed + cancelled || 1;
    const pct = (n: number) => Math.round((n / total) * 1000) / 10;
    const rows: ServiceLevelRow[] = [
      { lbl: 'Completed on-time', ct: onTime, pct: pct(onTime), cls: 'green' },
      { lbl: 'Late but completed', ct: late, pct: pct(late), cls: 'amber' },
      { lbl: 'Missed', ct: missed, pct: pct(missed), cls: 'red' },
      { lbl: 'Cancelled', ct: cancelled, pct: pct(cancelled), cls: 'red' },
    ];
    return { rows, isMock: false, isLoading };
  }, [visitsQ.data, isLoading]);
}

// ─── Stop-duration histogram (REAL, mock fallback) ─────────
export interface StopDurationResult {
  data: number[]; // 14 buckets of 5 minutes: <5, 5, 10 … 60+
  isMock: boolean;
  isLoading: boolean;
}

export function useStopDuration(from: string, to: string): StopDurationResult {
  const visitsQ = useVisitCompletions(from, to);
  const isLoading = visitsQ.isLoading;

  return useMemo<StopDurationResult>(() => {
    const visits = (visitsQ.data ?? []) as VisitRowLite[];
    const withDur = visits.filter((v) => isCompleted(v.status) && v.durationSec != null);
    if (withDur.length === 0) return { data: STOP_DURATION, isMock: !isLoading, isLoading };

    const buckets = new Array(14).fill(0);
    for (const v of withDur) {
      const mins = (v.durationSec ?? 0) / 60;
      const b = Math.min(Math.floor(mins / 5), 13);
      buckets[Math.max(b, 0)] += 1;
    }
    return { data: buckets, isMock: false, isLoading };
  }, [visitsQ.data, isLoading]);
}

// ─── Routes table (REAL, mock fallback) ────────────────────
export type RouteDisplayStatus =
  | 'completed'
  | 'late'
  | 'missed'
  | 'planned'
  | 'in_progress'
  | 'cancelled';

export interface RouteReportRow {
  id: string;
  scheduledDate: string;
  dateLabel: string;
  driverId: string;
  driverName: string;
  initials: string;
  avatarTone: AvatarTone;
  plate: string;
  status: RouteDisplayStatus;
  completedStops: number;
  totalStops: number;
  stopsLabel: string;
  distanceKm: number | null;
  durationLabel: string;
  onTimePct: number;
}

function deriveRow(
  route: Route,
  driverName: string,
  plate: string,
): RouteReportRow {
  const raw = mockOnTimePct(route.id);
  let status: RouteDisplayStatus;
  let onTimePct: number;

  const noStops = route.completedStops === 0;
  if (route.status === 'cancelled' || (noStops && route.status === 'completed')) {
    status = 'missed';
    onTimePct = 0;
  } else if (route.status === 'completed') {
    onTimePct = raw;
    status = raw >= 90 ? 'completed' : 'late';
  } else {
    status = route.status; // planned | in_progress
    onTimePct = raw;
  }

  return {
    id: route.id,
    scheduledDate: route.scheduledDate,
    dateLabel: fmtDateShort(route.scheduledDate),
    driverId: route.driverId,
    driverName,
    initials: initialsOf(driverName),
    avatarTone: toneFor(onTimePct),
    plate,
    status,
    completedStops: route.completedStops,
    totalStops: route.totalStops,
    stopsLabel: `${route.completedStops}/${route.totalStops}`,
    distanceKm: route.totalDistanceMeters != null ? route.totalDistanceMeters / 1000 : null,
    durationLabel:
      route.totalEstimatedSeconds != null ? fmtDuration(route.totalEstimatedSeconds) : '—',
    onTimePct,
  };
}

/** Labeled-mock fallback rows, normalised to the real row shape. */
function fallbackRows(): RouteReportRow[] {
  return FALLBACK_ROUTES.map((r, i) => ({
    id: `mock-${i}`,
    scheduledDate: r.date,
    dateLabel: r.date,
    driverId: `mock-${r.driver}`,
    driverName: r.driver,
    initials: initialsOf(r.driver),
    avatarTone: r.drvCls,
    plate: r.plate,
    status: r.status,
    completedStops: Number(r.stops.split('/')[0]),
    totalStops: Number(r.stops.split('/')[1]),
    stopsLabel: r.stops,
    distanceKm: r.dist || null,
    durationLabel: r.dur,
    onTimePct: r.otp,
  }));
}

export function useRouteReport(from: string, to: string) {
  const routesQuery = useRoutesByDateRange(from, to);
  const { data: drivers = [] } = useDrivers();

  const driverIndex = useMemo(() => {
    const m = new Map<string, { name: string; plate: string }>();
    drivers.forEach((d) =>
      m.set(d.id, { name: d.name, plate: d.vehiclePlate ?? '—' }),
    );
    return m;
  }, [drivers]);

  const rows = useMemo<RouteReportRow[]>(() => {
    const real = routesQuery.data ?? [];
    if (real.length === 0) return [];
    return real.map((r) => {
      const meta = driverIndex.get(r.driverId);
      return deriveRow(r, meta?.name ?? r.driverId.slice(0, 8), meta?.plate ?? '—');
    });
  }, [routesQuery.data, driverIndex]);

  const isMock = !routesQuery.isLoading && rows.length === 0;
  // Memoize the output rows — otherwise `fallbackRows()` returns a NEW array
  // identity every render, which loops `useRegisterExporter` via RoutesTab's
  // `useCallback([sorted])` (effect re-fires → setExporter → store change →
  // RoutesTab re-renders on its whole-store subscription → new rows → repeat).
  // Same fix already applied to useDriverLeaderboard below.
  const outRows = useMemo<RouteReportRow[]>(
    () => (isMock ? fallbackRows() : rows),
    [isMock, rows],
  );
  return {
    rows: outRows,
    isLoading: routesQuery.isLoading,
    isMock,
  };
}

// ─── Driver leaderboard (REAL, mock fallback) ──────────────
export interface LeaderRow {
  driverId: string;
  name: string;
  initials: string;
  visits: number;
  otp: number;
  km: number;
  delta: string;
  dir: 'up' | 'down';
}

export interface Leaderboards {
  byVisits: LeaderRow[];
  byOnTime: LeaderRow[];
  byDistance: LeaderRow[];
  isMock: boolean;
  isLoading: boolean;
}

export function useDriverLeaderboard(from: string, to: string): Leaderboards {
  const visitsQuery = useVisitCompletions(from, to);
  const routesQuery = useRoutesByDateRange(from, to);
  const { data: drivers = [] } = useDrivers();

  const isLoading = visitsQuery.isLoading || routesQuery.isLoading;

  const rows = useMemo<LeaderRow[]>(() => {
    const visits = visitsQuery.data ?? [];
    const routes = routesQuery.data ?? [];
    if (visits.length === 0 && routes.length === 0) return [];

    const nameOf = new Map(drivers.map((d) => [d.id, d.name]));
    const agg = new Map<string, { visits: number; onTime: number; km: number }>();
    const bump = (id: string) => {
      if (!agg.has(id)) agg.set(id, { visits: 0, onTime: 0, km: 0 });
      return agg.get(id)!;
    };

    visits.forEach((v) => {
      const a = bump(v.driverId);
      a.visits += 1;
      if (v.onTime) a.onTime += 1;
    });
    routes.forEach((r) => {
      if (r.totalDistanceMeters) bump(r.driverId).km += r.totalDistanceMeters / 1000;
    });

    return [...agg.entries()].map(([id, a]) => {
      const d = mockDelta(id);
      return {
        driverId: id,
        name: nameOf.get(id) ?? id.slice(0, 8),
        initials: initialsOf(nameOf.get(id) ?? id),
        visits: a.visits,
        otp: a.visits ? Math.round((a.onTime / a.visits) * 100) : 0,
        km: Math.round(a.km),
        delta: d.delta,
        dir: d.dir,
      };
    });
  }, [visitsQuery.data, routesQuery.data, drivers]);

  const isMock = !isLoading && rows.length === 0;
  const base = useMemo<LeaderRow[]>(
    () =>
      isMock ? FALLBACK_DRIVERS_LB.map((d) => ({ ...d, driverId: d.name })) : rows,
    [isMock, rows],
  );

  // Memoize the sorted slices — otherwise each render returns new array
  // identities, which loops `useRegisterExporter` via DriversTab's
  // `useCallback([byVisits])` (the effect re-fires → setExporter → store
  // change → re-render → new arrays → repeat).
  const byVisits = useMemo(
    () => [...base].sort((a, b) => b.visits - a.visits).slice(0, 7),
    [base],
  );
  const byOnTime = useMemo(
    () => [...base].sort((a, b) => b.otp - a.otp).slice(0, 7),
    [base],
  );
  const byDistance = useMemo(
    () => [...base].sort((a, b) => b.km - a.km).slice(0, 7),
    [base],
  );

  return { byVisits, byOnTime, byDistance, isMock, isLoading };
}

// ─── Route drilldown (REAL stops, mock timing/speed) ───────
export interface DrillStop {
  num: number;
  name: string;
  sub: string;
  actual: string;
  durLabel: string;
  state: 'ok' | 'late' | 'miss';
  delta: string;
}

export interface DrillData {
  route: Route | undefined;
  driverName: string;
  initials: string;
  plate: string;
  distanceKm: number | null;
  durationLabel: string;
  /** MOCK extras with no backing field. */
  idle: string;
  avgSpeed: number;
  topSpeed: number;
  speeding: number;
  speed: number[];
  stops: DrillStop[];
  shownLabel: string;
  isLoading: boolean;
}

export function useRouteDrilldown(routeId: string | null, fallbackName?: string): DrillData {
  // Synthetic fallback rows (`mock-*`) have no backend record — don't query them.
  const realId = routeId && !routeId.startsWith('mock-') ? routeId : null;
  const { data: route, isLoading: rLoading } = useRouteWithVisits(realId);
  const { data: visits = [], isLoading: vLoading } = useRouteVisits(realId);
  const { data: customers = [] } = useCustomers();
  const { data: drivers = [] } = useDrivers();

  return useMemo<DrillData>(() => {
    const driver = drivers.find((d) => d.id === route?.driverId);
    const driverName = driver?.name ?? fallbackName ?? 'Driver';
    const custName = new Map(customers.map((c) => [c.id, c]));
    const id = routeId ?? 'drill';

    const sorted = [...visits].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    const stops: DrillStop[] = sorted.map((v, i) => {
      const c = custName.get(v.customerId);
      const planned = `${pad(7 + Math.floor((30 + i * 40) / 60))}:${pad((30 + i * 40) % 60)}`;
      const actual = safeHhmm(v.arrivedAt) ?? safeHhmm(v.estimatedArrivalTime) ?? planned;
      const state: DrillStop['state'] =
        v.status === 'skipped' || v.status === 'failed'
          ? 'miss'
          : i % 4 === 1 ? 'late' : 'ok';
      const delta = state === 'miss' ? 'skipped' : state === 'late' ? `+${4 + i}m` : i === 0 ? 'on time' : `${i % 3 === 0 ? '−' : '+'}${1 + (i % 5)}m`;
      return {
        num: v.sequenceNumber || i + 1,
        name: c?.name ?? `Customer #${v.customerId}`,
        sub: c?.address ?? 'La Paz',
        actual,
        durLabel: state === 'miss' ? '—' : `${8 + ((i * 7) % 40)}m`,
        state,
        delta,
      };
    });

    return {
      route,
      driverName,
      initials: initialsOf(driverName),
      plate: driver?.vehiclePlate ?? '—',
      distanceKm: route?.totalDistanceMeters != null ? route.totalDistanceMeters / 1000 : null,
      durationLabel:
        route?.totalEstimatedSeconds != null ? fmtDuration(route.totalEstimatedSeconds) : '—',
      idle: `${10 + (mockOnTimePct(id) % 30)}`,
      avgSpeed: 30 + (mockOnTimePct(id) % 12),
      topSpeed: 60 + (mockOnTimePct(id) % 20),
      speeding: mockOnTimePct(id) % 4,
      speed: mockSpeedSeries(id),
      stops,
      shownLabel: `${route?.completedStops ?? stops.length}/${route?.totalStops ?? stops.length} · ${stops.length} shown`,
      isLoading: rLoading || vLoading,
    };
  }, [route, visits, customers, drivers, routeId, fallbackName, rLoading, vLoading]);
}
