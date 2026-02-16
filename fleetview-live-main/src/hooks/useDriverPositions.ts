import { useEffect } from 'react';
import { socketService } from '@/lib/socket';
import { useMapStore } from '@/stores/map.store';
import type { EnrichedPosition } from '@/types/position.types';

/**
 * Subscribes to real-time position updates via WebSocket.
 *
 * Accepts `isConnected` from useSocket() so the listener is
 * re-registered whenever the socket is torn down and recreated
 * (e.g. after token refresh or checkAuth).
 */
export function useDriverPositions(isConnected: boolean) {
  const updatePosition = useMapStore((state) => state.updatePosition);

  useEffect(() => {
    if (!isConnected) return;

    const handlePositionUpdate = (position: EnrichedPosition) => {
      console.log('📍 Position update:', position.driverName, position);
      updatePosition(position);
    };

    socketService.onPositionUpdate(handlePositionUpdate);

    return () => {
      socketService.offPositionUpdate(handlePositionUpdate);
    };
  }, [updatePosition, isConnected]);
}
