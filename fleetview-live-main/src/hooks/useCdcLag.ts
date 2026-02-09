import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { socketService } from '@/lib/socket';
import { WS_EVENTS } from '@/types/ws-events.types';
import type { CdcLagSnapshot } from '@/types/monitoring.types';

/**
 * Hook to fetch and monitor CDC lag metrics.
 * Combines REST API polling with real-time WebSocket updates.
 * Only available for admin users.
 */
export function useCdcLag() {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<CdcLagSnapshot | null>(null);

  // Initial fetch and fallback polling via REST API
  const query = useQuery({
    queryKey: ['cdc-lag'],
    queryFn: async () => {
      const response = await api.get<CdcLagSnapshot>('/sync/lag');
      return response.data;
    },
    refetchInterval: 10_000, // Fallback polling every 10s
    staleTime: 5_000, // Consider data stale after 5s
  });

  // Real-time updates via WebSocket (preferred method)
  useEffect(() => {
    const handleCdcLag = (data: CdcLagSnapshot) => {
      setSnapshot(data);
      // Update query cache to keep it in sync
      queryClient.setQueryData(['cdc-lag'], data);
    };

    socketService.onCdcLag(handleCdcLag);

    return () => {
      socketService.offCdcLag(handleCdcLag);
    };
  }, [queryClient]);

  // Return the most recent data from either source
  return {
    data: snapshot ?? query.data,
    isLoading: query.isLoading && !snapshot,
    error: query.error,
  };
}
