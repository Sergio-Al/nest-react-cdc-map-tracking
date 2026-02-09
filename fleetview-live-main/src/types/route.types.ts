import { PlannedVisit } from './visit.types';

export interface Route {
  id: string;
  tenantId: string;
  driverId: string;
  scheduledDate: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  totalStops: number;
  completedStops: number;
  createdAt: string;
  updatedAt: string;
  visits?: PlannedVisit[];
}

export interface CreateRouteDto {
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
