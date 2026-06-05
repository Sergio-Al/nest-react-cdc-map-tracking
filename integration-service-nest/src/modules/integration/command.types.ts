/**
 * Envelope produced by the tracking-service on `commands.*` topics.
 * Matches the Go service's `commandMessage`.
 */
export interface CommandMessage {
  op: string;
  correlationId: string;
  data: unknown;
}

export interface CustomerData {
  id?: number; // present only for op:'update'
  tenantId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  zone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters?: number | null;
  customerType?: string | null;
}

/** Payload for `commands.orders` op:'status' — a narrow, status-only write-back. */
export interface OrderStatusData {
  tenantId: string;
  orderId: number;
  status: string;
  completedAt?: string | null;
  driverId?: string | null;
  visitId?: string | null;
}

/**
 * Payload for `commands.orders` op:'create' / op:'update'. Emitted by the
 * tracking-service for integrated tenants that allow app-side order management;
 * the integration-service writes MySQL and Debezium CDC reflects it back.
 * `id` is present only for op:'update'; `customerId` is required for op:'create'.
 */
export interface OrderWriteData {
  id?: number;
  tenantId: string;
  customerId?: number;
  orderNumber?: string;
  status?: string;
  totalAmount?: number;
  deliveryDate?: string | null;
  notes?: string | null;
}

export interface DriverData {
  id: string;
  tenantId: string;
  name: string;
  deviceId?: string | null;
  phone?: string | null;
  vehiclePlate?: string | null;
  vehicleType?: string | null;
  status?: string | null;
}

/** Thrown for parse/validation/unknown-op failures → straight to DLQ, no retry. */
export class PermanentCommandError extends Error {}
