/** A single historical position point from TimescaleDB */
export interface HistoryPosition {
  time: string;
  driverId: string;
  tenantId: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  altitude: number;
  accuracy: number | null;
  routeId: string | null;
  visitId: string | null;
  customerName: string | null;
  distanceToNextM: number | null;
  etaToNextSec: number | null;
}

export interface HistoryQuery {
  from: string; // ISO 8601
  to: string;   // ISO 8601
}

/** A visit completion record from TimescaleDB */
export interface VisitCompletion {
  time: string;
  visitId: string;
  tenantId: string;
  driverId: string;
  customerId: number;
  routeId: string | null;
  visitType: string;
  status: string;
  arrivedAt: string | null;
  completedAt: string | null;
  durationSec: number | null;
  onTime: boolean;
}

/** Daily driver statistics from the continuous aggregate */
export interface DriverDailyStat {
  bucket: string;
  driverId: string;
  tenantId: string;
  positionCount: number;
  avgSpeed: number;
  maxSpeed: number;
  movingRatio: number;
}
