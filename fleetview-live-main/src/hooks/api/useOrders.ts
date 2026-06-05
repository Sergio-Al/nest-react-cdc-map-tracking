import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import api from '@/lib/axios';
import type { Order, CreateOrderDto, UpdateOrderDto } from '@/types/order.types';

/** Accepted (202) response shape for integrated tenants. */
interface AcceptedResponse {
  status: 'accepted';
  correlationId: string;
}

// ── Queries ──

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const response = await api.get<Order[]>('/orders');
      return response.data;
    },
    staleTime: 30_000,
  });
}

export function useOrder(id: number | null) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: async () => {
      const response = await api.get<Order>(`/orders/${id}`);
      return response.data;
    },
    enabled: id !== null,
    staleTime: 30_000,
  });
}

// ── Mutations ──

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateOrderDto) => {
      // Use the raw axios response so we can inspect HTTP status.
      const response = await api.post<Order | AcceptedResponse>('/orders', dto);
      return { status: response.status, data: response.data };
    },
    onSuccess: ({ status }) => {
      if (status === 202) {
        // Integrated tenant: row arrives via CDC; delay invalidation ~3 s.
        toast.success(i18n.t('orders:toasts.queued'), { duration: 5000 });
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
        }, 3000);
      } else {
        // Standalone tenant: row is immediately consistent (201).
        toast.success(i18n.t('orders:toasts.created'));
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      }
    },
    onError: () => {
      toast.error(i18n.t('orders:toasts.createFailed'));
    },
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: number; dto: UpdateOrderDto }) => {
      const response = await api.patch<Order | AcceptedResponse>(`/orders/${id}`, dto);
      return { status: response.status, data: response.data, id };
    },
    onSuccess: ({ status, id }) => {
      if (status === 202) {
        // Integrated tenant: async propagation via CDC.
        toast.success(i18n.t('orders:toasts.updateQueued'), { duration: 5000 });
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['orders', id] });
        }, 3000);
      } else {
        // Standalone tenant: synchronous write (200).
        toast.success(i18n.t('orders:toasts.updated'));
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['orders', id] });
      }
    },
    onError: () => {
      toast.error(i18n.t('orders:toasts.updateFailed'));
    },
  });
}
