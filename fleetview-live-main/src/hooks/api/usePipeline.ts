import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { socketService } from '@/lib/socket';
import { useSocket } from '@/hooks/useSocket';
import { useAuthStore } from '@/stores/auth.store';
import { mergeTraces } from '@/components/monitoring/pipeline-state';
import type { PipelineTrace, DlqTopics, DlqMessages } from '@/types/pipeline.types';

export function usePipelineTraces() {
  const tenantId = useAuthStore((state) => state.user?.tenantId);
  const queryClient = useQueryClient();
  const { isConnected } = useSocket();
  const query = useQuery({
    queryKey: ['pipeline-traces', tenantId],
    queryFn: async () => {
      const { data } = await api.get<PipelineTrace[]>('/pipeline/traces', { params: { limit: 100 } });
      return mergeTraces(queryClient.getQueryData<PipelineTrace[]>(['pipeline-traces', tenantId]) ?? [], data);
    },
    enabled: !!tenantId,
    refetchInterval: 5000,
  });
  useEffect(() => {
    if (!isConnected || !tenantId) return;
    const onTrace = (trace: PipelineTrace) => {
      if (trace.tenantId !== tenantId) return;
      queryClient.setQueryData<PipelineTrace[]>(['pipeline-traces', tenantId], (current = []) => mergeTraces(current, [trace]));
    };
    socketService.onPipelineTrace(onTrace);
    queryClient.invalidateQueries({ queryKey: ['pipeline-traces', tenantId] });
    return () => socketService.offPipelineTrace(onTrace);
  }, [isConnected, tenantId, queryClient]);
  return { ...query, isConnected };
}

export function useDlqTopics() {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: ['dlq-topics', user?.tenantId],
    queryFn: async () => (await api.get<DlqTopics>('/dlq/topics')).data,
    enabled: user?.role === 'admin',
    refetchInterval: 10000,
  });
}

export function useDlqMessages(topic: string | null) {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: ['dlq-messages', user?.tenantId, topic],
    queryFn: async () => (await api.get<DlqMessages>(`/dlq/${encodeURIComponent(topic!)}/messages`, { params: { limit: 20 } })).data,
    enabled: user?.role === 'admin' && !!topic,
    refetchInterval: 10000,
  });
}

export function useReplayDlq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (topic: string) => (await api.post<{ topic: string; replayed: number; errors: number }>(
      `/dlq/${encodeURIComponent(topic)}/replay`, {}, { params: { limit: 100 } },
    )).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dlq-topics'] });
      queryClient.invalidateQueries({ queryKey: ['dlq-messages'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-traces'] });
    },
  });
}
