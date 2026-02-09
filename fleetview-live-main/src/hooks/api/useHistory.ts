import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import type { HistoryPosition } from '@/types/history.types';

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
