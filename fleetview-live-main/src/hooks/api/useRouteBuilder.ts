import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import type { Route, CreateRouteDto, UpdateRouteDto } from '@/types/route.types';
import type { PlannedVisit } from '@/types/visit.types';
import type { Customer } from '@/types/customer.types';

// ── Types ──

export interface RouteGeometry {
  geometry: string;           // encoded polyline (Google format)
  depot: { lat: number; lon: number };
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}

// ── Queries ──

export function useRouteWithVisits(routeId: string | null) {
  return useQuery({
    queryKey: ['routes', routeId],
    queryFn: async () => {
      const response = await api.get<Route>(`/routes/${routeId}`);
      return response.data;
    },
    enabled: !!routeId,
  });
}

export function useRouteVisits(routeId: string | null) {
  return useQuery({
    queryKey: ['visits', 'route', routeId],
    queryFn: async () => {
      const response = await api.get<PlannedVisit[]>(`/visits/route/${routeId}`);
      return response.data;
    },
    enabled: !!routeId,
    staleTime: 10_000,
  });
}

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get<Customer[]>('/customers');
      return response.data;
    },
    staleTime: 60_000,
  });
}

export function useRouteGeometry(routeId: string | null, visitCount: number) {
  return useQuery({
    queryKey: ['routes', routeId, 'geometry', visitCount],
    queryFn: async () => {
      const response = await api.get<RouteGeometry>(`/routes/${routeId}/geometry`);
      return response.data;
    },
    enabled: !!routeId && visitCount >= 1,
    staleTime: 30_000,
  });
}

// ── Mutations ──

export function useCreateRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateRouteDto) => {
      const response = await api.post<Route>('/routes', dto);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    },
  });
}

export function useUpdateRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateRouteDto }) => {
      const response = await api.patch<Route>(`/routes/${id}`, dto);
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['routes', id] });
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    },
  });
}

export function useOptimizeRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (routeId: string) => {
      const response = await api.post<Route>(`/routes/${routeId}/optimize`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['routes', data.id] });
      queryClient.invalidateQueries({ queryKey: ['visits', 'route', data.id] });
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    },
  });
}

export function useReorderVisits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      routeId,
      visits,
    }: {
      routeId: string;
      visits: { visitId: string; sequenceNumber: number }[];
    }) => {
      const response = await api.patch<Route>(`/routes/${routeId}/reorder`, { visits });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['routes', data.id] });
      queryClient.invalidateQueries({ queryKey: ['visits', 'route', data.id] });
    },
  });
}

export function useAddVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: {
      tenantId: string;
      routeId: string;
      driverId: string;
      customerId: number;
      sequenceNumber: number;
      visitType?: string;
      scheduledDate: string;
      timeWindowStart?: string;
      timeWindowEnd?: string;
      notes?: string;
    }) => {
      const response = await api.post<PlannedVisit>('/visits', {
        ...dto,
        customerId: Number(dto.customerId),
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['visits', 'route', data.routeId] });
      queryClient.invalidateQueries({ queryKey: ['routes', data.routeId] });
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    },
  });
}

export function useDeleteVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ visitId, routeId }: { visitId: string; routeId: string }) => {
      await api.delete(`/visits/${visitId}`);
      return { visitId, routeId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['visits', 'route', data.routeId] });
      queryClient.invalidateQueries({ queryKey: ['routes', data.routeId] });
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    },
  });
}
