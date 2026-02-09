export interface RawGpsPosition {
  deviceId: string | number;
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  altitude: number;
  accuracy: number;
  deviceTime?: string;
  fixTime?: string;
  serverTime?: string;
  valid?: boolean;
  attributes?: Record<string, unknown>;
}

export interface EnrichedPosition {
  time: string;
  driverId: string;
  tenantId: string;
  driverName: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  altitude: number;
  accuracy: number | null;
  routeId: string | null;
  currentVisitId: string | null;
  nextVisitId: string | null;
  nextCustomerName: string | null;
  nextCustomerLat: number | null;
  nextCustomerLon: number | null;
  distanceToNextM: number | null;
  etaToNextSec: number | null;
  insideGeofence: boolean;
  geofenceCustomerId: number | null;
  visitAutoArrival: boolean;
}
