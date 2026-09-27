import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { civilRangeToUtc, presetRange, useUserTz } from '@/lib/datetime';
import { useCustomers } from '@/hooks/api/useRouteBuilder';
import { useVehicles } from '@/hooks/api/useVehicles';
import type { Customer } from '@/types/customer.types';
import type { DriverEvent } from '@/types/driverEvent.types';
import type { HistoryPosition } from '@/types/history.types';
import type { Route } from '@/types/route.types';
import type { PlannedVisit } from '@/types/visit.types';

const REFRESH_MS = 30_000;

function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * Same rule as the inbox summaries: the in-progress route wins, else the route
 * scheduled for the user's LOCAL today (the backend's /today uses the UTC date,
 * which is already tomorrow after 20:00 in La Paz).
 */
async function fetchDriverRoute(driverId: string, today: string): Promise<Route | null> {
  const active = await api.get<Route | null>(`/routes/driver/${driverId}/active`);
  if (active.data && !Array.isArray(active.data)) return active.data;
  const routes = await api.get<Route[]>('/routes', { params: { from: today, to: today } });
  return routes.data.find((r) => r.driverId === driverId) ?? null;
}

export interface RouteSummary {
  routeName: string;
  progress: number;
  total: number;
}

export type StopState = 'done' | 'current' | 'pending' | 'skipped' | 'failed';

export interface RouteStop {
  id: string;
  name: string;
  orderId?: number | null;
  visitType: string;
  state: StopState;
  time: string | null;
  isEta: boolean;
}

export interface CurrentRoute {
  summary: RouteSummary;
  stops: RouteStop[];
}

function routeName(route: Route, customers: Customer[]): string {
  if (route.depotLabel?.trim()) return route.depotLabel.trim();
  const byId = new Map(customers.map((c) => [Number(c.id), c])); // bigint ids arrive as strings
  const counts = new Map<string, number>();
  for (const visit of route.visits ?? []) {
    const zone = byId.get(Number(visit.customerId))?.zone?.trim();
    if (zone) counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

export function toCurrentRoute(route: Route | null | undefined, customers: Customer[]): CurrentRoute | null {
  if (!route) return null;
  const byId = new Map(customers.map((c) => [Number(c.id), c])); // bigint ids arrive as strings
  const visits = [...(route.visits ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  let currentAssigned = false;
  const stops: RouteStop[] = visits.map((visit: PlannedVisit) => {
    let state: StopState = 'pending';
    if (visit.status === 'completed') state = 'done';
    else if (visit.status === 'skipped' || visit.status === 'failed') state = visit.status;
    else if (!currentAssigned) {
      state = 'current';
      currentAssigned = true;
    }
    const isEta = state !== 'done' && state !== 'skipped' && state !== 'failed';
    return {
      id: visit.id,
      name: byId.get(Number(visit.customerId))?.name ?? `#${visit.customerId}`,
      orderId: visit.orderId,
      visitType: visit.visitType,
      state,
      time: state === 'done' ? visit.completedAt : isEta ? visit.estimatedArrivalTime : null,
      isEta,
    };
  });
  return {
    summary: { routeName: routeName(route, customers), progress: visits.filter((v) => v.status === 'completed').length, total: visits.length },
    stops,
  };
}

export function useDriverCurrentRoute(driverId: string | null): CurrentRoute | null {
  const { from: today } = presetRange('today', useUserTz());
  const route = useQuery({
    queryKey: ['driver-route', driverId, today],
    queryFn: () => fetchDriverRoute(driverId!, today),
    enabled: !!driverId,
    staleTime: 10_000,
    refetchInterval: REFRESH_MS,
  });
  const { data: customers = [] } = useCustomers();
  return toCurrentRoute(route.data, customers);
}

/**
 * Route summaries for every listed driver from ONE request (routes scheduled
 * yesterday..tomorrow, to absorb UTC-vs-local date skew) — not a query per
 * driver, which wouldn't scale to a 1,000-driver inbox. Per driver: the
 * in-progress route wins, else the one scheduled for the local today.
 */
export function useDriverRouteSummaries(driverIds: string[], enabled = true): Record<string, RouteSummary | null> {
  const tz = useUserTz();
  const { from: today } = presetRange('today', tz);
  const { data: routes = [] } = useQuery({
    queryKey: ['driver-route-summaries', today],
    queryFn: async () =>
      (await api.get<Route[]>('/routes', { params: { from: shiftYmd(today, -1), to: shiftYmd(today, 1) } })).data,
    enabled,
    staleTime: 10_000,
    refetchInterval: REFRESH_MS,
  });
  const { data: customers = [] } = useCustomers();
  const pick = (id: string) => {
    const mine = routes.filter((r) => r.driverId === id);
    return mine.find((r) => r.status === 'in_progress') ?? mine.find((r) => r.scheduledDate === today) ?? null;
  };
  return Object.fromEntries(driverIds.map((id) => [id, toCurrentRoute(pick(id), customers)?.summary ?? null]));
}

function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayRange(tz: string) {
  const { from, to } = presetRange('today', tz);
  return { day: from, ...civilRangeToUtc(from, to, tz) };
}

export function useDriverEvents(driverId: string | null): DriverEvent[] {
  const tz = useUserTz();
  useClock();
  const { day, fromIso, toIso } = todayRange(tz);
  const query = useQuery({
    queryKey: ['driver-events', driverId, tz, day],
    queryFn: async () => (await api.get<DriverEvent[]>(`/drivers/${driverId}/events`, { params: { from: fromIso, to: toIso } })).data,
    enabled: !!driverId,
    refetchInterval: REFRESH_MS,
  });
  return query.data ?? [];
}

function useHistory(driverId: string | null, from: string, to: string, key: string) {
  return useQuery({
    queryKey: ['driver-history', driverId, key, from],
    queryFn: async () => (await api.get<HistoryPosition[]>(`/drivers/${driverId}/history`, { params: { from, to } })).data,
    enabled: !!driverId,
    refetchInterval: REFRESH_MS,
  });
}

export function useDriverSpeedHistory(driverId: string | null): number[] {
  const windowEnd = Math.floor(useClock() / REFRESH_MS) * REFRESH_MS;
  const from = new Date(windowEnd - 60 * 60_000).toISOString();
  const to = new Date(windowEnd + REFRESH_MS).toISOString();
  const { data = [] } = useHistory(driverId, from, to, 'speed');
  if (data.length === 0) return [];
  const sums = Array(40).fill(0) as number[];
  const counts = Array(40).fill(0) as number[];
  for (const point of data) {
    const i = Math.floor((new Date(point.time).getTime() - new Date(from).getTime()) / 90_000);
    if (i >= 0 && i < 40 && Number.isFinite(Number(point.speed))) {
      sums[i] += Number(point.speed);
      counts[i]++;
    }
  }
  return sums.map((sum, i) => counts[i] ? Math.round(sum / counts[i]) : 0);
}

/** Distance driven today (user's local day), computed server-side. */
export function useDriverDistanceToday(driverId: string | null): number | null {
  const tz = useUserTz();
  useClock();
  const { day, fromIso, toIso } = todayRange(tz);
  const query = useQuery({
    queryKey: ['driver-distance', driverId, tz, day],
    queryFn: async () =>
      (await api.get<{ distanceKm: number }>(`/drivers/${driverId}/distance`, { params: { from: fromIso, to: toIso } })).data
        .distanceKm,
    enabled: !!driverId,
    refetchInterval: REFRESH_MS,
  });
  return query.data ?? null;
}

export function useDriverVehicle(driverId: string | null, plate?: string | null) {
  const { data = [] } = useVehicles();
  if (!driverId) return null;
  return data.find((v) => v.driverId === driverId) ?? data.find((v) => !!plate && v.plate === plate) ?? null;
}
