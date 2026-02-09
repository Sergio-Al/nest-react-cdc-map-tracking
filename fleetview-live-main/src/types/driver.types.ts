export interface Driver {
  id: string;
  tenantId: string;
  deviceId: string | null;
  name: string;
  phone: string | null;
  vehiclePlate: string | null;
  vehicleType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriverPosition {
  driverId: string;
  tenantId: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  altitude: number;
  accuracy: number | null;
  currentRouteId: string | null;
  currentVisitId: string | null;
  nextVisitId: string | null;
  distanceToNextM: number | null;
  etaToNextSec: number | null;
  updatedAt: string;
}
