import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import api from '@/lib/axios';
import { translateApiError } from '@/lib/apiError';

export interface Entitlements {
  planCode: string;
  planName: string;
  pricePerSeatCents: number;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'free';
  features: string[];
  maxDrivers: number | null;
  activeDrivers: number;
  seatsPurchased: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  integrationAllowed: boolean;
  integrationMode: 'standalone' | 'integrated';
  integrationStatus: string;
}

export interface SubscriptionPlan {
  code: string;
  name: string;
  pricePerSeatCents: number;
  maxDrivers: number | null;
  integrationAllowed: boolean;
  features: string[];
  purchasable: boolean;
}

export function useEntitlements() {
  return useQuery({
    queryKey: ['entitlements', 'me'],
    queryFn: async () => {
      const res = await api.get<Entitlements>('/me/entitlements');
      return res.data;
    },
    staleTime: 60_000,
  });
}

/**
 * Returns true when the authenticated tenant has the given feature gate.
 * Defaults to false while loading or when the entitlements are unavailable.
 */
export function useHasFeature(feature: string): boolean {
  const { data } = useEntitlements();
  if (!data) return false;
  return data.features.includes(feature);
}

// ── Billing hooks ──

export function usePlans() {
  return useQuery({
    queryKey: ['subscriptions', 'plans'],
    queryFn: async () => {
      const res = await api.get<SubscriptionPlan[]>('/subscriptions/plans');
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: async (planCode: string) => {
      const res = await api.post<{ url: string }>('/subscriptions/checkout', { planCode });
      return res.data;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => {
      const msg = translateApiError(
        err,
        i18n.t('billing:errors.checkoutFailed', { ns: 'billing' }),
      );
      toast.error(msg);
    },
  });
}

export function usePortal() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ url: string }>('/subscriptions/portal', {});
      return res.data;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => {
      const msg = translateApiError(
        err,
        i18n.t('billing:errors.portalFailed', { ns: 'billing' }),
      );
      toast.error(msg);
    },
  });
}

export function useStartTrial() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<Entitlements>('/subscriptions/trial/start');
      return res.data;
    },
    onError: (err) => {
      const msg = translateApiError(
        err,
        i18n.t('billing:errors.trialFailed', { ns: 'billing' }),
      );
      toast.error(msg);
    },
  });
}
