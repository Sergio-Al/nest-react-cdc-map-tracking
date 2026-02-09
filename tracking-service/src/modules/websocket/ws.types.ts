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
 * Event names for type safety
 */
export const WS_EVENTS = {
  // Server → Client
  POSITION_UPDATE: 'position:update',
  VISIT_UPDATE: 'visit:update',
  CDC_LAG: 'cdc:lag',
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
