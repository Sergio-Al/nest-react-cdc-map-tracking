import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { useAuthStore } from '@/stores/auth.store';
import type { EffectiveSettings } from '@/types/auth.types';

/** Raw stored layers (NULL = inherit). Mirrors the backend entities. */
export interface UserSettingsRaw {
  userId: string;
  tenantId: string;
  timezone: string | null;
  locale: string | null;
  dateFormat: string | null;
  numberFormat: string | null;
  units: string | null;
  defaultReportPreset: string | null;
  theme: string | null;
  density: string | null;
}
export interface TenantSettingsRaw {
  tenantId: string;
  timezone: string;
  locale: string;
  dateFormat: string;
  numberFormat: string;
  units: string;
  defaultReportPreset: string;
  ingestMode?: 'standalone' | 'integrated' | string;
  allowAppOrderCreate?: boolean;
}

interface MeSettingsResponse {
  effective: EffectiveSettings;
  user: UserSettingsRaw | null;
  tenant: TenantSettingsRaw | null;
}

export type UserSettingsPatch = Partial<
  Pick<
    EffectiveSettings,
    'timezone' | 'locale' | 'dateFormat' | 'numberFormat' | 'units' | 'defaultReportPreset' | 'theme' | 'density'
  >
>;
export type TenantSettingsPatch = Omit<UserSettingsPatch, 'theme' | 'density'> & {
  ingestMode?: string;
  allowAppOrderCreate?: boolean;
};

export function useSettings() {
  const setSettings = useAuthStore((s) => s.setSettings);
  return useQuery({
    queryKey: ['settings', 'me'],
    queryFn: async () => {
      const res = await api.get<MeSettingsResponse>('/me/settings');
      // Keep the auth store's effective settings in sync with the server.
      setSettings(res.data.effective);
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useUpdateUserSettings() {
  const qc = useQueryClient();
  const setSettings = useAuthStore((s) => s.setSettings);
  return useMutation({
    mutationFn: async (patch: UserSettingsPatch) => {
      const res = await api.put<{ effective: EffectiveSettings }>('/me/settings', patch);
      return res.data.effective;
    },
    onSuccess: (effective) => {
      setSettings(effective);
      qc.invalidateQueries({ queryKey: ['settings', 'me'] });
    },
  });
}

export function useTenantSettings(enabled = true) {
  return useQuery({
    queryKey: ['settings', 'tenant'],
    queryFn: async () => {
      const res = await api.get<TenantSettingsRaw | null>('/tenant/settings');
      return res.data;
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useUpdateTenantSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TenantSettingsPatch) => {
      const res = await api.put<TenantSettingsRaw>('/tenant/settings', patch);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'tenant'] });
      qc.invalidateQueries({ queryKey: ['settings', 'me'] });
    },
  });
}
