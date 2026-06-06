import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { useAuthStore } from '@/stores/auth.store';

/** Per-item state as stored server-side (mirrors OnboardingItemState). */
export interface OnboardingItemState {
  status: string; // pending | completed | dismissed | snoozed
  step: number | null;
  seenAt: string | null;
}

/** Map of item_key → state, as returned by GET /me/onboarding. */
export type OnboardingStateMap = Record<string, OnboardingItemState>;

export interface AckPayload {
  status?: 'pending' | 'completed' | 'dismissed' | 'snoozed';
  step?: number;
}

const QUERY_KEY = ['onboarding', 'me'] as const;

/** All onboarding/announcement acknowledgements for the current user. */
export function useOnboardingState() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<OnboardingStateMap>('/me/onboarding');
      return res.data ?? {};
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

/** Acknowledge / update progress on one item (PUT /me/onboarding/:key). */
export function useAckOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, payload }: { key: string; payload: AckPayload }) => {
      const res = await api.put<OnboardingItemState>(`/me/onboarding/${key}`, payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

const DONE = new Set(['completed', 'dismissed']);

/**
 * Convenience wrapper for a single onboarding item. `acknowledged` is true once
 * the item is completed or dismissed; use `ack()` to record progress/dismissal
 * and `setStep()` to persist the resume point of a multi-step flow.
 */
export function useOnboarding(key: string) {
  const { data, isLoading } = useOnboardingState();
  const mutation = useAckOnboarding();
  const item = data?.[key];

  return {
    isLoading,
    status: item?.status ?? 'pending',
    step: item?.step ?? null,
    acknowledged: item ? DONE.has(item.status) : false,
    ack: (payload: AckPayload = { status: 'completed' }) =>
      mutation.mutate({ key, payload }),
    setStep: (step: number) => mutation.mutate({ key, payload: { step } }),
  };
}
