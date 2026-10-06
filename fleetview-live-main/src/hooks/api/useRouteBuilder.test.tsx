import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { useCreateCustomer } from './useRouteBuilder';
import type { Customer } from '@/types/customer.types';

vi.mock('@/lib/axios', () => ({ default: { post: vi.fn() } }));

const customer: Customer = {
  id: 1000000000,
  tenantId: 'standalone',
  name: 'New customer',
  phone: null,
  email: null,
  address: null,
  zone: null,
  latitude: null,
  longitude: null,
  geofenceRadiusMeters: 100,
  customerType: 'retail',
  active: true,
  syncedAt: '2026-10-05T12:00:00Z',
};

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const existing = { ...customer, id: 1001, name: 'Existing customer' };
  queryClient.setQueryData(['customers'], [existing]);
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useCreateCustomer(), { wrapper });
  return { ...hook, queryClient, invalidate, existing };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('useCreateCustomer', () => {
  it('adds the standalone row immediately and refreshes without a CDC delay', async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockResolvedValue({ status: 201, data: customer });
    const { result, queryClient, invalidate, existing, unmount } = setup();

    await act(async () => {
      const response = await result.current.mutateAsync({ tenantId: customer.tenantId, name: customer.name });
      expect(response).toEqual({ status: 201, data: customer });
    });

    expect(queryClient.getQueryData(['customers'])).toEqual([existing, customer]);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['customers'] });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(invalidate).toHaveBeenCalledTimes(1);
    unmount();
    queryClient.clear();
  });

  it('keeps accepted commands out of the row cache and waits for CDC propagation', async () => {
    vi.useFakeTimers();
    const accepted = { status: 'accepted', correlationId: 'command-1' };
    vi.mocked(api.post).mockResolvedValue({ status: 202, data: accepted });
    const { result, queryClient, invalidate, existing, unmount } = setup();

    await act(async () => {
      const response = await result.current.mutateAsync({ tenantId: 'integrated', name: customer.name });
      expect(response).toEqual({ status: 202, data: accepted });
    });

    expect(queryClient.getQueryData(['customers'])).toEqual([existing]);
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2999); });
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['customers'] });
    unmount();
    queryClient.clear();
  });
});
