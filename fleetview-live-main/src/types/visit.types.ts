export interface PlannedVisit {
  id: string;
  tenantId: string;
  routeId: string;
  driverId: string;
  customerId: number;
  sequenceNumber: number;
  visitType: string;
  scheduledDate: string;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  status: 'pending' | 'en_route' | 'arrived' | 'in_progress' | 'completed' | 'skipped' | 'failed';
  arrivedAt: string | null;
  departedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateVisitDto {
  status?: 'pending' | 'en_route' | 'arrived' | 'in_progress' | 'completed' | 'skipped' | 'failed';
  notes?: string;
  arrivedAt?: string;
  departedAt?: string;
  completedAt?: string;
}

export interface VisitEvent {
  visitId: string;
  routeId: string;
  driverId: string;
  customerId: number;
  tenantId: string;
  previousStatus: string;
  currentStatus: string;
  visitType: string;
  arrivedAt: string | null;
  completedAt: string | null;
  timestamp: string;
}
