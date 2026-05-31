import type { ActiveFilter, FieldDef, FieldOption, SavedView } from '@/components/filters/types';
import type { RouteReportRow } from '@/hooks/api/useReports';
import type { VisitCompletion } from '@/types/history.types';
import type { Vehicle } from '@/types/vehicle.types';
import type { Customer } from '@/types/customer.types';
import type { Driver } from '@/types/driver.types';
import type { CustomerCategory } from '@/lib/mock/customerMeta';
import { CATEGORY_META } from '@/lib/mock/customerMeta';

/** Rows enriched with looked-up display names so they can be filtered by name. */
export interface VisitRow extends VisitCompletion {
  driverName: string;
  customerName: string;
}
export interface VehicleRow extends Vehicle {
  driverName: string;
}
/** Customer enriched with derived metadata for the directory page. */
export interface CustomerDirectoryRow extends Customer {
  category: CustomerCategory;
  lastVisitDays: number;
  monthlyFrequency: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

/** Distinct, sorted options derived from the current rows. */
function uniqOptions<T>(
  rows: T[],
  valueFn: (r: T) => string | number | null | undefined,
  labelFn: (r: T) => string,
): FieldOption[] {
  const map = new Map<string, string>();
  for (const r of rows) {
    const v = valueFn(r);
    if (v == null || v === '') continue;
    const key = String(v);
    if (!map.has(key)) map.set(key, labelFn(r));
  }
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Routes ────────────────────────────────────────────────
const ROUTE_STATUS: FieldOption[] = [
  { value: 'completed', label: 'Completed' },
  { value: 'late', label: 'Late' },
  { value: 'missed', label: 'Missed' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const ROUTE_FIELDS: FieldDef<RouteReportRow>[] = [
  { id: 'status', label: 'Status', kind: 'enum', options: () => ROUTE_STATUS, get: (r) => r.status },
  {
    id: 'driver',
    label: 'Driver',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.driverId, (r) => r.driverName),
    get: (r) => r.driverId,
  },
  {
    id: 'vehicle',
    label: 'Vehicle',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.plate, (r) => r.plate),
    get: (r) => r.plate,
  },
  { id: 'onTime', label: 'On-time', kind: 'number', unit: '%', get: (r) => r.onTimePct },
  { id: 'distance', label: 'Distance', kind: 'number', unit: 'km', get: (r) => r.distanceKm },
  { id: 'stops', label: 'Stops', kind: 'number', get: (r) => r.completedStops },
];

// ─── Visits ────────────────────────────────────────────────
export const VISIT_FIELDS: FieldDef<VisitRow>[] = [
  {
    id: 'status',
    label: 'Status',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.status, (r) => cap(r.status)),
    get: (r) => r.status,
  },
  {
    id: 'driver',
    label: 'Driver',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.driverId, (r) => r.driverName),
    get: (r) => r.driverId,
  },
  {
    id: 'customer',
    label: 'Customer',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.customerId, (r) => r.customerName),
    get: (r) => r.customerId,
  },
  {
    id: 'type',
    label: 'Type',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.visitType, (r) => cap(r.visitType)),
    get: (r) => r.visitType,
  },
  {
    id: 'onTime',
    label: 'Punctuality',
    kind: 'enum',
    options: () => [
      { value: 'true', label: 'On time' },
      { value: 'false', label: 'Late' },
    ],
    get: (r) => String(r.onTime),
  },
  {
    id: 'duration',
    label: 'Duration',
    kind: 'number',
    unit: ' min',
    get: (r) => (r.durationSec != null ? Math.round(r.durationSec / 60) : null),
  },
];

// ─── Vehicles ──────────────────────────────────────────────
export const VEHICLE_FIELDS: FieldDef<VehicleRow>[] = [
  {
    id: 'status',
    label: 'Status',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.status, (r) => cap(r.status)),
    get: (r) => r.status,
  },
  {
    id: 'type',
    label: 'Type',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.type, (r) => cap(r.type)),
    get: (r) => r.type,
  },
  {
    id: 'driver',
    label: 'Driver',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.driverId ?? '', (r) => r.driverName),
    get: (r) => (r.driverId ? r.driverName : ''),
  },
  { id: 'capacity', label: 'Capacity', kind: 'number', unit: ' kg', get: (r) => r.capacityKg },
  { id: 'year', label: 'Year', kind: 'number', get: (r) => r.year },
];

// ─── Customers ─────────────────────────────────────────────
export const CUSTOMER_FIELDS: FieldDef<Customer>[] = [
  {
    id: 'type',
    label: 'Type',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.customerType, (r) => cap(r.customerType)),
    get: (r) => r.customerType,
  },
  {
    id: 'active',
    label: 'Status',
    kind: 'enum',
    options: () => [
      { value: 'true', label: 'Active' },
      { value: 'false', label: 'Inactive' },
    ],
    get: (r) => String(r.active),
  },
  { id: 'geofence', label: 'Geofence', kind: 'number', unit: ' m', get: (r) => r.geofenceRadiusMeters },
];

// ─── Customers (directory page — adds derived Category) ──
export const CUSTOMER_DIRECTORY_FIELDS: FieldDef<CustomerDirectoryRow>[] = [
  {
    id: 'category',
    label: 'Category',
    kind: 'enum',
    options: (rows) =>
      uniqOptions(rows, (r) => r.category, (r) => CATEGORY_META[r.category].label),
    get: (r) => r.category,
  },
  {
    id: 'type',
    label: 'Type',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.customerType, (r) => cap(r.customerType)),
    get: (r) => r.customerType,
  },
  {
    id: 'active',
    label: 'Status',
    kind: 'enum',
    options: () => [
      { value: 'true', label: 'Active' },
      { value: 'false', label: 'Inactive' },
    ],
    get: (r) => String(r.active),
  },
  { id: 'geofence', label: 'Geofence', kind: 'number', unit: ' m', get: (r) => r.geofenceRadiusMeters },
  { id: 'lastVisit', label: 'Last visit', kind: 'number', unit: ' d', get: (r) => r.lastVisitDays },
  { id: 'frequency', label: 'Frequency', kind: 'number', unit: '/mo', get: (r) => r.monthlyFrequency },
];

// ─── Drivers ───────────────────────────────────────────────
export const DRIVER_FIELDS: FieldDef<Driver>[] = [
  {
    id: 'status',
    label: 'Status',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.status, (r) => cap(r.status)),
    get: (r) => r.status,
  },
  {
    id: 'vehicleType',
    label: 'Vehicle type',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.vehicleType, (r) => cap(r.vehicleType)),
    get: (r) => r.vehicleType,
  },
  {
    id: 'hasVehicle',
    label: 'Assigned vehicle',
    kind: 'enum',
    options: () => [
      { value: 'true', label: 'Has vehicle' },
      { value: 'false', label: 'Unassigned' },
    ],
    get: (r) => String(Boolean(r.vehiclePlate)),
  },
  {
    id: 'hasDevice',
    label: 'Device',
    kind: 'enum',
    options: () => [
      { value: 'true', label: 'Has device' },
      { value: 'false', label: 'No device' },
    ],
    get: (r) => String(Boolean(r.deviceId)),
  },
];

// ─── Built-in (preset) views per dataset ───────────────────
const statusView = (id: string, values: string[]): ActiveFilter => ({
  id,
  field: 'status',
  operator: 'any_of',
  values,
  num1: null,
  num2: null,
});

export const ROUTE_VIEWS: SavedView[] = [
  { id: 'all', name: 'All routes', filters: [], builtin: true },
  { id: 'late', name: 'Late', filters: [statusView('f-late', ['late'])], builtin: true },
  { id: 'missed', name: 'Missed', filters: [statusView('f-missed', ['missed'])], builtin: true },
];
export const VISIT_VIEWS: SavedView[] = [{ id: 'all', name: 'All visits', filters: [], builtin: true }];
export const VEHICLE_VIEWS: SavedView[] = [{ id: 'all', name: 'All vehicles', filters: [], builtin: true }];
export const CUSTOMER_VIEWS: SavedView[] = [{ id: 'all', name: 'All customers', filters: [], builtin: true }];

export const CUSTOMER_DIRECTORY_VIEWS: SavedView[] = [
  { id: 'all', name: 'All', filters: [], builtin: true },
  {
    id: 'premium',
    name: 'Premium',
    builtin: true,
    filters: [{ id: 'f-prem', field: 'type', operator: 'any_of', values: ['premium'], num1: null, num2: null }],
  },
  {
    id: 'inactive',
    name: 'Inactive',
    builtin: true,
    filters: [{ id: 'f-inact', field: 'active', operator: 'any_of', values: ['false'], num1: null, num2: null }],
  },
  {
    id: 'visited-week',
    name: 'Visited this week',
    builtin: true,
    filters: [{ id: 'f-lv', field: 'lastVisit', operator: 'lte', values: [], num1: 7, num2: null }],
  },
];

export const DRIVER_VIEWS: SavedView[] = [
  { id: 'all', name: 'All', filters: [], builtin: true },
  {
    id: 'online',
    name: 'Online',
    builtin: true,
    filters: [{ id: 'f-on', field: 'status', operator: 'any_of', values: ['online'], num1: null, num2: null }],
  },
  {
    id: 'unassigned',
    name: 'Unassigned',
    builtin: true,
    filters: [{ id: 'f-un', field: 'hasVehicle', operator: 'any_of', values: ['false'], num1: null, num2: null }],
  },
  {
    id: 'no-device',
    name: 'No device',
    builtin: true,
    filters: [{ id: 'f-nd', field: 'hasDevice', operator: 'any_of', values: ['false'], num1: null, num2: null }],
  },
];
