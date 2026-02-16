import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import api from '@/lib/axios';
import { useMapStore } from '@/stores/map.store';
import type { Driver, DriverPosition } from '@/types/driver.types';
import type { EnrichedPosition } from '@/types/position.types';

export function useDrivers() {
  return useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const response = await api.get<Driver[]>('/drivers');
      return response.data;
    },
    staleTime: 30000, // 30 seconds
  });
}

export function useDriver(id: string) {
  return useQuery({
    queryKey: ['drivers', id],
    queryFn: async () => {
      const response = await api.get<Driver>(`/drivers/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Fetches initial driver positions from the REST API and seeds
 * the map store so drivers aren't shown as "offline" on page load.
 * Real-time WebSocket updates will overwrite these as they arrive.
 */
export function useInitialPositions(drivers: Driver[]) {
  const updatePosition = useMapStore((state) => state.updatePosition);

  const { data: positions } = useQuery({
    queryKey: ['driver-positions'],
    queryFn: async () => {
      const response = await api.get<DriverPosition[]>('/drivers/positions/all');
      return response.data;
    },
    staleTime: 30000,
  });

  useEffect(() => {
    if (!positions || drivers.length === 0) return;

    // Build a name lookup from drivers
    const driverMap = new Map(drivers.map((d) => [d.id, d]));

    for (const pos of positions) {
      const driver = driverMap.get(pos.driverId);
      if (!driver) continue;

      // Map DriverPosition → EnrichedPosition so the map store can use it
      const enriched: EnrichedPosition = {
        time: pos.updatedAt,
        driverId: pos.driverId,
        tenantId: pos.tenantId,
        driverName: driver.name,
        deviceId: driver.deviceId ?? '',
        latitude: pos.latitude,
        longitude: pos.longitude,
        speed: pos.speed,
        heading: pos.heading,
        altitude: pos.altitude,
        accuracy: pos.accuracy,
        routeId: pos.currentRouteId,
        currentVisitId: pos.currentVisitId,
        nextVisitId: pos.nextVisitId,
        nextCustomerName: null,
        nextCustomerLat: null,
        nextCustomerLon: null,
        distanceToNextM: pos.distanceToNextM,
        etaToNextSec: pos.etaToNextSec,
        insideGeofence: false,
        geofenceCustomerId: null,
        visitAutoArrival: false,
      };

      updatePosition(enriched);
    }
  }, [positions, drivers, updatePosition]);
}
