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
