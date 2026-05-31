import { useMemo } from "react";
import {
  getMockEvents,
  getMockStops,
  getMockSpeedHistory,
  getMockVehicleInfo,
  getMockRouteSummary,
} from "@/lib/mock/driverMock";
import type {
  MockEvent,
  MockStop,
  MockRouteSummary,
  MockVehicle,
} from "@/lib/mock/driverMock";

/**
 * Driver-detail data hooks. These currently return MOCK data (no backend yet).
 * To wire real endpoints later, replace each body with a React Query `useQuery`
 * call (e.g. GET /drivers/:id/events, /drivers/:id/current-route) — the component
 * contract (return shapes) stays the same.
 */

export function useDriverEvents(driverId: string | null, plate?: string | null): MockEvent[] {
  return useMemo(() => (driverId ? getMockEvents(driverId, plate) : []), [driverId, plate]);
}

export interface CurrentRoute {
  summary: MockRouteSummary;
  stops: MockStop[];
}

export function useDriverCurrentRoute(driverId: string | null): CurrentRoute | null {
  return useMemo(
    () =>
      driverId
        ? { summary: getMockRouteSummary(driverId), stops: getMockStops(driverId) }
        : null,
    [driverId],
  );
}

export function useDriverSpeedHistory(driverId: string | null): number[] {
  return useMemo(() => (driverId ? getMockSpeedHistory(driverId) : []), [driverId]);
}

export function useDriverVehicle(driverId: string | null): MockVehicle | null {
  return useMemo(() => (driverId ? getMockVehicleInfo(driverId) : null), [driverId]);
}
