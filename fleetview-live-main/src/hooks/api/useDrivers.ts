import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import type { Driver } from '@/types/driver.types';

export function useDrivers() {
  return useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const response = await api.get<Driver[]>('/drivers');
      return response.data;
    },
    staleTime: 30000, // 30 seconds
  });
}

export function useDriver(id: string) {
  return useQuery({
    queryKey: ['drivers', id],
    queryFn: async () => {
      const response = await api.get<Driver>(`/drivers/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}
