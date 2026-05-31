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
  labelKeyFn?: (value: string) => string,
): FieldOption[] {
  const map = new Map<string, string>();
  for (const r of rows) {
    const v = valueFn(r);
    if (v == null || v === '') continue;
    const key = String(v);
    if (!map.has(key)) map.set(key, labelFn(r));
  }
  return [...map.entries()]
    .map(([value, label]) => ({
      value,
      label,
      ...(labelKeyFn ? { labelKey: labelKeyFn(value) } : {}),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Shorthand: enum option whose label key follows `filters.options.<value>`. */
const opt = (value: string, label: string): FieldOption => ({
  value,
  label,
  labelKey: `filters.options.${value}`,
});

// ─── Routes ────────────────────────────────────────────────
const ROUTE_STATUS: FieldOption[] = [
  opt('completed', 'Completed'),
  opt('late', 'Late'),
  opt('missed', 'Missed'),
  opt('planned', 'Planned'),
  opt('in_progress', 'In progress'),
  opt('cancelled', 'Cancelled'),
];

export const ROUTE_FIELDS: FieldDef<RouteReportRow>[] = [
  {
    id: 'status',
    label: 'Status',
    labelKey: 'filters.fields.status',
    kind: 'enum',
    options: () => ROUTE_STATUS,
    get: (r) => r.status,
  },
  {
    id: 'driver',
    label: 'Driver',
    labelKey: 'filters.fields.driver',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.driverId, (r) => r.driverName),
    get: (r) => r.driverId,
  },
  {
    id: 'vehicle',
    label: 'Vehicle',
    labelKey: 'filters.fields.vehicle',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.plate, (r) => r.plate),
    get: (r) => r.plate,
  },
  {
    id: 'onTime',
    label: 'On-time',
    labelKey: 'filters.fields.onTime',
    kind: 'number',
    unit: '%',
    get: (r) => r.onTimePct,
  },
  {
    id: 'distance',
    label: 'Distance',
    labelKey: 'filters.fields.distance',
    kind: 'number',
    unit: 'km',
    get: (r) => r.distanceKm,
  },
  {
    id: 'stops',
    label: 'Stops',
    labelKey: 'filters.fields.stops',
    kind: 'number',
    get: (r) => r.completedStops,
  },
];

// ─── Visits ────────────────────────────────────────────────
export const VISIT_FIELDS: FieldDef<VisitRow>[] = [
  {
    id: 'status',
    label: 'Status',
    labelKey: 'filters.fields.status',
    kind: 'enum',
    options: (rows) =>
      uniqOptions(rows, (r) => r.status, (r) => cap(r.status), (v) => `filters.options.${v}`),
    get: (r) => r.status,
  },
  {
    id: 'driver',
    label: 'Driver',
    labelKey: 'filters.fields.driver',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.driverId, (r) => r.driverName),
    get: (r) => r.driverId,
  },
  {
    id: 'customer',
    label: 'Customer',
    labelKey: 'filters.fields.customer',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.customerId, (r) => r.customerName),
    get: (r) => r.customerId,
  },
  {
    id: 'type',
    label: 'Type',
    labelKey: 'filters.fields.type',
    kind: 'enum',
    options: (rows) =>
      uniqOptions(rows, (r) => r.visitType, (r) => cap(r.visitType), (v) => `filters.options.${v}`),
    get: (r) => r.visitType,
  },
  {
    id: 'onTime',
    label: 'Punctuality',
    labelKey: 'filters.fields.punctuality',
    kind: 'enum',
    options: () => [
      { value: 'true', label: 'On time', labelKey: 'filters.options.punctuality.onTime' },
      { value: 'false', label: 'Late', labelKey: 'filters.options.punctuality.late' },
    ],
    get: (r) => String(r.onTime),
  },
  {
    id: 'duration',
    label: 'Duration',
    labelKey: 'filters.fields.duration',
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
    labelKey: 'filters.fields.status',
    kind: 'enum',
    options: (rows) =>
      uniqOptions(rows, (r) => r.status, (r) => cap(r.status), (v) => `filters.options.${v}`),
    get: (r) => r.status,
  },
  {
    id: 'type',
    label: 'Type',
    labelKey: 'filters.fields.type',
    kind: 'enum',
    options: (rows) =>
      uniqOptions(rows, (r) => r.type, (r) => cap(r.type), (v) => `filters.options.${v}`),
    get: (r) => r.type,
  },
  {
    id: 'driver',
    label: 'Driver',
    labelKey: 'filters.fields.driver',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.driverId ?? '', (r) => r.driverName),
    get: (r) => (r.driverId ? r.driverName : ''),
  },
  {
    id: 'capacity',
    label: 'Capacity',
    labelKey: 'filters.fields.capacity',
    kind: 'number',
    unit: ' kg',
    get: (r) => r.capacityKg,
  },
  {
    id: 'year',
    label: 'Year',
    labelKey: 'filters.fields.year',
    kind: 'number',
    get: (r) => r.year,
  },
];

// ─── Customers ─────────────────────────────────────────────
export const CUSTOMER_FIELDS: FieldDef<Customer>[] = [
  {
    id: 'type',
    label: 'Type',
    labelKey: 'filters.fields.type',
    kind: 'enum',
    options: (rows) =>
      uniqOptions(
        rows,
        (r) => r.customerType,
        (r) => cap(r.customerType),
        (v) => `filters.options.${v}`,
      ),
    get: (r) => r.customerType,
  },
  {
    id: 'active',
    label: 'Status',
    labelKey: 'filters.fields.active',
    kind: 'enum',
    options: () => [
      { value: 'true', label: 'Active', labelKey: 'filters.options.active.active' },
      { value: 'false', label: 'Inactive', labelKey: 'filters.options.active.inactive' },
    ],
    get: (r) => String(r.active),
  },
  {
    id: 'geofence',
    label: 'Geofence',
    labelKey: 'filters.fields.geofence',
    kind: 'number',
    unit: ' m',
    get: (r) => r.geofenceRadiusMeters,
  },
];

// ─── Customers (directory page — adds derived Category) ──
export const CUSTOMER_DIRECTORY_FIELDS: FieldDef<CustomerDirectoryRow>[] = [
  {
    id: 'category',
    label: 'Category',
    labelKey: 'filters.fields.category',
    kind: 'enum',
    options: (rows) =>
      uniqOptions(
        rows,
        (r) => r.category,
        (r) => CATEGORY_META[r.category].label,
        (v) => `filters.options.${v}`,
      ),
    get: (r) => r.category,
  },
  {
    id: 'type',
    label: 'Type',
    labelKey: 'filters.fields.type',
    kind: 'enum',
    options: (rows) =>
      uniqOptions(
        rows,
        (r) => r.customerType,
        (r) => cap(r.customerType),
        (v) => `filters.options.${v}`,
      ),
    get: (r) => r.customerType,
  },
  {
    id: 'active',
    label: 'Status',
    labelKey: 'filters.fields.active',
    kind: 'enum',
    options: () => [
      { value: 'true', label: 'Active', labelKey: 'filters.options.active.active' },
      { value: 'false', label: 'Inactive', labelKey: 'filters.options.active.inactive' },
    ],
    get: (r) => String(r.active),
  },
  {
    id: 'geofence',
    label: 'Geofence',
    labelKey: 'filters.fields.geofence',
    kind: 'number',
    unit: ' m',
    get: (r) => r.geofenceRadiusMeters,
  },
  {
    id: 'lastVisit',
    label: 'Last visit',
    labelKey: 'filters.fields.lastVisit',
    kind: 'number',
    unit: ' d',
    get: (r) => r.lastVisitDays,
  },
  {
    id: 'frequency',
    label: 'Frequency',
    labelKey: 'filters.fields.frequency',
    kind: 'number',
    unit: '/mo',
    get: (r) => r.monthlyFrequency,
  },
];

// ─── Drivers ───────────────────────────────────────────────
export const DRIVER_FIELDS: FieldDef<Driver>[] = [
  {
    id: 'status',
    label: 'Status',
    labelKey: 'filters.fields.status',
    kind: 'enum',
    options: (rows) =>
      uniqOptions(rows, (r) => r.status, (r) => cap(r.status), (v) => `filters.options.${v}`),
    get: (r) => r.status,
  },
  {
    id: 'vehicleType',
    label: 'Vehicle type',
    labelKey: 'filters.fields.vehicleType',
    kind: 'enum',
    options: (rows) =>
      uniqOptions(
        rows,
        (r) => r.vehicleType,
        (r) => cap(r.vehicleType),
        (v) => `filters.options.${v}`,
      ),
    get: (r) => r.vehicleType,
  },
  {
    id: 'hasVehicle',
    label: 'Assigned vehicle',
    labelKey: 'filters.fields.hasVehicle',
    kind: 'enum',
    options: () => [
      { value: 'true', label: 'Has vehicle', labelKey: 'filters.options.hasVehicle.yes' },
      { value: 'false', label: 'Unassigned', labelKey: 'filters.options.hasVehicle.no' },
    ],
    get: (r) => String(Boolean(r.vehiclePlate)),
  },
  {
    id: 'hasDevice',
    label: 'Device',
    labelKey: 'filters.fields.hasDevice',
    kind: 'enum',
    options: () => [
      { value: 'true', label: 'Has device', labelKey: 'filters.options.hasDevice.yes' },
      { value: 'false', label: 'No device', labelKey: 'filters.options.hasDevice.no' },
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
  { id: 'all', name: 'All routes', nameKey: 'filters.views.allRoutes', filters: [], builtin: true },
  {
    id: 'late',
    name: 'Late',
    nameKey: 'filters.views.late',
    filters: [statusView('f-late', ['late'])],
    builtin: true,
  },
  {
    id: 'missed',
    name: 'Missed',
    nameKey: 'filters.views.missed',
    filters: [statusView('f-missed', ['missed'])],
    builtin: true,
  },
];
export const VISIT_VIEWS: SavedView[] = [
  { id: 'all', name: 'All visits', nameKey: 'filters.views.allVisits', filters: [], builtin: true },
];
export const VEHICLE_VIEWS: SavedView[] = [
  { id: 'all', name: 'All vehicles', nameKey: 'filters.views.allVehicles', filters: [], builtin: true },
];
export const CUSTOMER_VIEWS: SavedView[] = [
  { id: 'all', name: 'All customers', nameKey: 'filters.views.allCustomers', filters: [], builtin: true },
];

export const CUSTOMER_DIRECTORY_VIEWS: SavedView[] = [
  { id: 'all', name: 'All', nameKey: 'filters.views.all', filters: [], builtin: true },
  {
    id: 'premium',
    name: 'Premium',
    nameKey: 'filters.views.premium',
    builtin: true,
    filters: [{ id: 'f-prem', field: 'type', operator: 'any_of', values: ['premium'], num1: null, num2: null }],
  },
  {
    id: 'inactive',
    name: 'Inactive',
    nameKey: 'filters.views.inactive',
    builtin: true,
    filters: [{ id: 'f-inact', field: 'active', operator: 'any_of', values: ['false'], num1: null, num2: null }],
  },
  {
    id: 'visited-week',
    name: 'Visited this week',
    nameKey: 'filters.views.visitedThisWeek',
    builtin: true,
    filters: [{ id: 'f-lv', field: 'lastVisit', operator: 'lte', values: [], num1: 7, num2: null }],
  },
];

export const DRIVER_VIEWS: SavedView[] = [
  { id: 'all', name: 'All', nameKey: 'filters.views.all', filters: [], builtin: true },
  {
    id: 'online',
    name: 'Online',
    nameKey: 'filters.views.online',
    builtin: true,
    filters: [{ id: 'f-on', field: 'status', operator: 'any_of', values: ['online'], num1: null, num2: null }],
  },
  {
    id: 'unassigned',
    name: 'Unassigned',
    nameKey: 'filters.views.unassigned',
    builtin: true,
    filters: [{ id: 'f-un', field: 'hasVehicle', operator: 'any_of', values: ['false'], num1: null, num2: null }],
  },
  {
    id: 'no-device',
    name: 'No device',
    nameKey: 'filters.views.noDevice',
    builtin: true,
    filters: [{ id: 'f-nd', field: 'hasDevice', operator: 'any_of', values: ['false'], num1: null, num2: null }],
  },
];
