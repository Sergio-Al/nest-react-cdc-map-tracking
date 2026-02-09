import { useEffect } from 'react';
import { socketService } from '@/lib/socket';
import { useMapStore } from '@/stores/map.store';
import type { EnrichedPosition } from '@/types/position.types';

export function useDriverPositions() {
  const updatePosition = useMapStore((state) => state.updatePosition);

  useEffect(() => {
    const handlePositionUpdate = (position: EnrichedPosition) => {
      console.log('📍 Position update:', position.driverName, position);
      updatePosition(position);
    };

    socketService.onPositionUpdate(handlePositionUpdate);

    return () => {
      socketService.offPositionUpdate(handlePositionUpdate);
    };
  }, [updatePosition]);
}
