/**
 * Generic, dataset-agnostic filter subsystem (filter bar + builder + saved views).
 *
 * Wire it into any list/table:
 *   1. Define a `FieldDef<T>[]` registry and built-in `SavedView[]` for your dataset.
 *   2. `const ds = useDatasetFilters(key, rows, fields, views)`.
 *   3. Render `<FilterBar … />` and render `ds.filtered`.
 *
 * Reference registry + usage: `components/reports/reportFilters.ts`,
 * `components/reports/RoutesTab.tsx`, `components/reports/DataTables.tsx`.
 * Scaffold a new one with the `/filter-table` command.
 */
export * from './types';
export * from './engine';
export * from './useDatasetFilters';
export { FilterBar } from './FilterBar';
export { FilterBuilder } from './FilterBuilder';
