import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useSocket } from '@/hooks/useSocket';
import { socketService } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth.store';
import type { CdcChangeEvent } from '@/types/ws-events.types';

const TOAST_INTERVAL_MS = 15_000;

/** One session-level CDC listener keeps query data fresh on every page. */
export function useCdcChanges(): void {
  const { isConnected } = useSocket();
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');
  const lastToastAt = useRef(0);

  useEffect(() => {
    if (!isConnected || !tenantId) return;
    const onChange = (event: CdcChangeEvent) => {
      if (event.tenantId !== tenantId) return;
      if (event.table === 'orders') queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (event.table === 'customers') {
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        queryClient.invalidateQueries({ queryKey: ['routes'] });
        queryClient.invalidateQueries({ queryKey: ['driver-route'] });
        queryClient.invalidateQueries({ queryKey: ['driver-route-summaries'] });
      }
      if (event.table === 'products') queryClient.invalidateQueries({ queryKey: ['products'] });
      if (event.table === 'accounts') queryClient.invalidateQueries({ queryKey: ['accounts'] });

      const now = Date.now();
      if (now - lastToastAt.current < TOAST_INTERVAL_MS) return;
      lastToastAt.current = now;
      toast.info(t('cdcChange.received', {
        entity: t(`cdcChange.entity.${event.table}`),
        id: event.id,
        latency: event.latencyMs == null ? t('cdcChange.latencyUnknown') : `${(event.latencyMs / 1000).toFixed(1)} s`,
      }));
    };
    socketService.onCdcChange(onChange);
    return () => socketService.offCdcChange(onChange);
  }, [isConnected, queryClient, t, tenantId]);
}
