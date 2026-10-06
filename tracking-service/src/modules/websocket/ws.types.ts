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
 * A business-data change applied through CDC or a standalone PostgreSQL write.
 * Emitted to tenant:{tenantId} after PostgreSQL was updated, so clients can refetch.
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

/** Shared payload for CDC-applied and standalone business-data writes. */
export function buildCdcChangeEvent(
  table: CdcChangeEvent['table'],
  op: CdcChangeEvent['op'],
  id: number,
  tenantId: string,
  sourceTsMs: number | null,
  appliedAt: number,
): CdcChangeEvent {
  return {
    table,
    op,
    id,
    tenantId,
    sourceTsMs,
    appliedAt: new Date(appliedAt).toISOString(),
    latencyMs: sourceTsMs ? Math.max(0, appliedAt - sourceTsMs) : null,
  };
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
  PIPELINE_TRACE: 'pipeline:trace',
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
