import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';

export interface Entitlements {
  planCode: string;
  status: string;
  features: string[];
  maxDrivers: number | null;
  activeDrivers: number;
  integrationAllowed: boolean;
  integrationMode: string;
  integrationStatus: string;
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
