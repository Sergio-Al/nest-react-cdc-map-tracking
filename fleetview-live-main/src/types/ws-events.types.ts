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

export interface JoinTenantDto {
  tenantId: string;
}

export interface JoinDriverDto {
  driverId: string;
}

export interface JoinRouteDto {
  routeId: string;
}

export interface ActiveDriversResponse {
  drivers: string[];
  count: number;
}
