import { EnrichedPosition } from '../enrichment/enrichment.types';

/**
 * Visit lifecycle event published to Kafka and broadcast via WebSocket
 */
export interface VisitEvent {
  visitId: string;
  routeId: string;
  driverId: string;
  customerId: number;
  tenantId: string;
  previousStatus: string;
  currentStatus: string;
  visitType: string;
  arrivedAt: Date | null;
  completedAt: Date | null;
  timestamp: string;
}

/**
 * Room join/leave payloads
 */
export interface JoinTenantDto {
  tenantId: string;
}

export interface JoinDriverDto {
  driverId: string;
}

export interface JoinRouteDto {
  routeId: string;
}

/**
 * Active drivers response
 */
export interface ActiveDriversResponse {
  drivers: string[];
  count: number;
}

/**
 * WebSocket gateway statistics
 */
export interface GatewayStats {
  connectedClients: number;
  rooms: number;
}

/**
 * A business-data change that arrived through CDC (MySQL → Debezium → PG) —
 * i.e. made in the tenant's own system. Emitted to tenant:{tenantId} after the
 * PostgreSQL read model was updated, so clients can refetch.
 */
export interface CdcChangeEvent {
  table: 'accounts' | 'customers' | 'products' | 'orders';
  op: 'c' | 'u' | 'd';
  id: number;
  tenantId: string;
  /** MySQL commit time (Debezium __source_ts_ms). */
  sourceTsMs: number | null;
  /** When the PostgreSQL write finished (ISO). */
  appliedAt: string;
  /** appliedAt − sourceTsMs: commit → visible. */
  latencyMs: number | null;
}

/**
 * Event names for type safety
 */
export const WS_EVENTS = {
  // Server → Client
  POSITION_UPDATE: 'position:update',
  VISIT_UPDATE: 'visit:update',
  CDC_LAG: 'cdc:lag',
  CDC_CHANGE: 'cdc:change',
  ERROR: 'error',

  // Client → Server
  JOIN_TENANT: 'join-tenant',
  JOIN_DRIVER: 'join-driver',
  JOIN_ROUTE: 'join-route',
  LEAVE_TENANT: 'leave-tenant',
  LEAVE_DRIVER: 'leave-driver',
  LEAVE_ROUTE: 'leave-route',
  GET_ACTIVE_DRIVERS: 'get-active-drivers',
} as const;
