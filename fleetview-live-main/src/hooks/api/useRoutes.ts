import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import type { Route } from '@/types/route.types';

export function useRoutes() {
  return useQuery({
    queryKey: ['routes'],
    queryFn: async () => {
      const response = await api.get<Route[]>('/routes');
      return response.data;
    },
    staleTime: 30000,
  });
}

export function useRoute(id: string | null) {
  return useQuery({
    queryKey: ['routes', id],
    queryFn: async () => {
      const response = await api.get<Route>(`/routes/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}
