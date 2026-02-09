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
