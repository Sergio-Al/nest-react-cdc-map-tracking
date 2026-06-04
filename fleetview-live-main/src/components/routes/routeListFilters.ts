import type { ActiveFilter, FieldDef, FieldOption, SavedView } from '@/components/filters/types';
import type { Route } from '@/types/route.types';

/** A route enriched with its driver's display name so it can be filtered by driver. */
export interface RouteListRow extends Route {
  driverName: string;
}

/** Enum option whose label key follows `filters.options.<value>` (in `common`). */
const opt = (value: string, label: string): FieldOption => ({
  value,
  label,
  labelKey: `filters.options.${value}`,
});

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

const ROUTE_STATUS: FieldOption[] = [
  opt('planned', 'Planned'),
  opt('in_progress', 'In progress'),
  opt('completed', 'Completed'),
  opt('cancelled', 'Cancelled'),
];

export const ROUTE_LIST_FIELDS: FieldDef<RouteListRow>[] = [
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
    options: (rows) => uniqOptions(rows, (r) => r.driverId, (r) => r.driverName || r.driverId),
    get: (r) => r.driverId,
  },
  {
    id: 'date',
    label: 'Date',
    labelKey: 'filters.fields.date',
    kind: 'enum',
    options: (rows) => uniqOptions(rows, (r) => r.scheduledDate, (r) => r.scheduledDate),
    get: (r) => r.scheduledDate,
  },
  {
    id: 'stops',
    label: 'Stops',
    labelKey: 'filters.fields.stops',
    kind: 'number',
    get: (r) => r.totalStops,
  },
];

const statusView = (id: string, value: string): ActiveFilter => ({
  id,
  field: 'status',
  operator: 'any_of',
  values: [value],
  num1: null,
  num2: null,
});

export const ROUTE_LIST_VIEWS: SavedView[] = [
  { id: 'all', name: 'All routes', nameKey: 'filters.views.allRoutes', filters: [], builtin: true },
  {
    id: 'planned',
    name: 'Planned',
    nameKey: 'filters.views.planned',
    filters: [statusView('f-planned', 'planned')],
    builtin: true,
  },
  {
    id: 'in_progress',
    name: 'In progress',
    nameKey: 'filters.views.inProgress',
    filters: [statusView('f-inprog', 'in_progress')],
    builtin: true,
  },
  {
    id: 'completed',
    name: 'Completed',
    nameKey: 'filters.views.completed',
    filters: [statusView('f-completed', 'completed')],
    builtin: true,
  },
];
