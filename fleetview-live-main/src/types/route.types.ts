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
  createdAt: string;
  updatedAt: string;
  visits?: PlannedVisit[];
}

export interface CreateRouteDto {
  tenantId: string;
  driverId: string;
  scheduledDate: string;
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
}
