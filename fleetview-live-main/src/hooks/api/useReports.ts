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
} from './useHistory';
import { useDrivers } from './useDrivers';
import { useRouteWithVisits, useRouteVisits, useCustomers } from './useRouteBuilder';
import type { Route } from '@/types/route.types';
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

// ─── MOCK-backed seams ─────────────────────────────────────
export const useReportKpis = () => REPORT_KPIS;
export const useReportTrend = () => REPORT_TREND;
export const useReportInsights = () => REPORT_INSIGHTS;
export const useServiceLevel = () => SERVICE_LEVEL;
export const useStopDuration = () => STOP_DURATION;
export const useByZone = () => BY_ZONE;

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
  return {
    rows: isMock ? fallbackRows() : rows,
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
