import { PlannedVisit } from './visit.types';

export interface Route {
  id: string;
  tenantId: string;
  driverId: string;
  scheduledDate: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  totalStops: number;
  completedStops: number;
  totalDistanceMeters: number | null;
  totalEstimatedSeconds: number | null;
  optimizedAt: string | null;
  optimizationMethod: string | null;
  // Per-route starting point. null lat/lon → dynamic (driver's live GPS).
  depotLat: number | null;
  depotLon: number | null;
  depotLabel: string | null;
  returnToDepot: boolean;
  createdAt: string;
  updatedAt: string;
  visits?: PlannedVisit[];
}

export interface CreateRouteDto {
  tenantId: string;
  driverId: string;
  scheduledDate: string;
  depotLat?: number;
  depotLon?: number;
  depotLabel?: string;
  returnToDepot?: boolean;
  visits?: {
    customerId: number;
    sequenceNumber: number;
    scheduledDate: string;
    timeWindowStart?: string;
    timeWindowEnd?: string;
  }[];
}

export interface UpdateRouteDto {
  status?: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  driverId?: string;
  scheduledDate?: string;
  // null clears the pin (→ dynamic / driver live GPS); a number pins it.
  depotLat?: number | null;
  depotLon?: number | null;
  depotLabel?: string | null;
  returnToDepot?: boolean;
}
