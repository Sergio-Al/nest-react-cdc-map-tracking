import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import type { HistoryPosition, VisitCompletion, DriverDailyStat } from '@/types/history.types';
import type { Route } from '@/types/route.types';
import { useUserTz, civilRangeToUtc } from '@/lib/datetime';

export function useDriverHistory(driverId: string | null, from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['driver-history', driverId, from, to],
    queryFn: async () => {
      const response = await api.get<HistoryPosition[]>(
        `/drivers/${driverId}/history`,
        { params: { from, to } },
      );
      return response.data;
    },
    enabled: !!driverId && !!from && !!to,
    staleTime: 60000,
  });
}

export function useRouteHistory(routeId: string | null, from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['route-history', routeId, from, to],
    queryFn: async () => {
      const response = await api.get<HistoryPosition[]>(
        `/routes/${routeId}/history`,
        { params: { from, to } },
      );
      return response.data;
    },
    enabled: !!routeId && !!from && !!to,
    staleTime: 60000,
  });
}

export function useRoutesByDateRange(
  from: string | null,
  to: string | null,
  status?: string,
) {
  return useQuery({
    queryKey: ['routes-report', from, to, status],
    queryFn: async () => {
      const response = await api.get<Route[]>('/routes', {
        params: { from, to, ...(status ? { status } : {}) },
      });
      return response.data;
    },
    enabled: !!from && !!to,
    staleTime: 60000,
  });
}

// `from`/`to` are civil `yyyy-mm-dd` days in the user's timezone; these
// instant-based endpoints get them converted to UTC ISO bounds so a "day"
// means the user's civil day, not a UTC day.
export function useVisitCompletions(
  from: string | null,
  to: string | null,
  driverId?: string,
) {
  const tz = useUserTz();
  return useQuery({
    queryKey: ['visit-completions', from, to, driverId, tz],
    queryFn: async () => {
      const { fromIso, toIso } = civilRangeToUtc(from!, to!, tz);
      const response = await api.get<VisitCompletion[]>('/history/visits', {
        params: { from: fromIso, to: toIso, ...(driverId ? { driverId } : {}) },
      });
      return response.data;
    },
    enabled: !!from && !!to,
    staleTime: 60000,
  });
}

export function useDriverDailyStats(from: string | null, to: string | null) {
  const tz = useUserTz();
  return useQuery({
    queryKey: ['driver-daily-stats', from, to, tz],
    queryFn: async () => {
      const { fromIso, toIso } = civilRangeToUtc(from!, to!, tz);
      const response = await api.get<DriverDailyStat[]>('/history/stats', {
        params: { from: fromIso, to: toIso },
      });
      return response.data;
    },
    enabled: !!from && !!to,
    staleTime: 60000,
  });
}
