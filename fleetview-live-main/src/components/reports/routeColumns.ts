/** Column model for the Routes report table — shared by RoutesTable (render)
 *  and RoutesTab (the Columns picker). Kept in its own module so neither
 *  component file exports a non-component value. */

export type SortCol =
  | 'date'
  | 'driver'
  | 'vehicle'
  | 'status'
  | 'visits'
  | 'distance'
  | 'duration'
  | 'otp';

export interface SortState {
  col: SortCol;
  dir: 'asc' | 'desc';
}

export interface ColumnDef {
  id: SortCol;
  label: string;
  num?: boolean;
  /** Identity columns that can't be hidden from the Columns picker. */
  locked?: boolean;
}

export const ROUTE_COLUMNS: ColumnDef[] = [
  { id: 'date', label: 'Date', locked: true },
  { id: 'driver', label: 'Driver', locked: true },
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'status', label: 'Status' },
  { id: 'visits', label: 'Visits', num: true },
  { id: 'distance', label: 'Distance', num: true },
  { id: 'duration', label: 'Duration', num: true },
  { id: 'otp', label: 'On-time %' },
];
