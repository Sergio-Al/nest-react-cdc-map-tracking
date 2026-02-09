export type DriverStatus = "active" | "idle" | "offline";

export type VisitStatus = "pending" | "arrived" | "completed" | "skipped";

export interface Driver {
  id: string;
  name: string;
  plate: string;
  phone: string;
  status: DriverStatus;
  speed: number;
  lastUpdate: number; // seconds ago
  lat: number;
  lng: number;
  course: number;
  distanceToday: number;
  routeId?: string;
  routeName?: string;
  routeProgress?: number;
  visitsCompleted?: number;
  visitsTotal?: number;
}

export interface Route {
  id: string;
  name: string;
  driverId: string;
  progress: number;
  visitsCompleted: number;
  visitsTotal: number;
  color: string;
}

export type MapStyle = "streets" | "satellite";

export type StatusFilter = "all" | "active" | "idle" | "offline";
