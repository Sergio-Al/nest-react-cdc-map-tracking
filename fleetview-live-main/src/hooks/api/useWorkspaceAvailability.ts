import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import type { WorkspaceAvailabilityResponse } from '@/types/auth.types';

/** The slug regex mirroring the server's SLUG_REGEX. */
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/**
 * Checks whether a workspace ID (slug) is available.
 * Only fires when `id` passes the format regex.
 * Uses a staleTime of 0 so each unique id is always re-fetched from the server.
 */
export function useWorkspaceAvailability(id: string) {
  const formatValid = SLUG_REGEX.test(id);

  return useQuery({
    queryKey: ['workspace-availability', id],
    queryFn: async () => {
      const response = await api.get<WorkspaceAvailabilityResponse>(
        `/auth/workspace-available?id=${encodeURIComponent(id)}`,
      );
      return response.data;
    },
    enabled: formatValid && id.length > 0,
    staleTime: 0,
    retry: false,
  });
}
