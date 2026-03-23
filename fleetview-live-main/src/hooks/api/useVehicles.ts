import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import type { Vehicle } from '@/types/vehicle.types';

export function useVehicles() {
  return useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const response = await api.get<Vehicle[]>('/vehicles');
      return response.data;
    },
    staleTime: 30000,
  });
}

export function useVehicle(id: string) {
  return useQuery({
    queryKey: ['vehicles', id],
    queryFn: async () => {
      const response = await api.get<Vehicle>(`/vehicles/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export interface CreateVehicleDto {
  plate: string;
  type?: string;
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  capacityKg?: number;
  driverId?: string;
  notes?: string;
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateVehicleDto) => {
      const response = await api.post<Vehicle>('/vehicles', dto);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}

export interface UpdateVehicleDto {
  plate?: string;
  type?: string;
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  capacityKg?: number;
  status?: string;
  driverId?: string | null;
  notes?: string;
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateVehicleDto }) => {
      const response = await api.patch<Vehicle>(`/vehicles/${id}`, dto);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}
