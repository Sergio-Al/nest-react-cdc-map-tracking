/** Generic, dataset-agnostic filter model shared by every Reports data table. */

export type FieldKind = 'enum' | 'number';

export type Operator =
  | 'any_of'
  | 'not_any_of'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'gte'
  | 'gt'
  | 'between';

export const ENUM_OPERATORS: Operator[] = ['any_of', 'not_any_of'];
export const NUMBER_OPERATORS: Operator[] = ['lt', 'lte', 'eq', 'gte', 'gt', 'between'];

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef<T> {
  id: string;
  label: string;
  kind: FieldKind;
  /** Suffix shown in number pills, e.g. '%' or 'km'. */
  unit?: string;
  /** Choosable options for enum fields (may be derived from the current rows). */
  options?: (rows: T[]) => FieldOption[];
  /** Comparable value for a row: number for `number` fields, stringifiable for `enum`. */
  get: (row: T) => string | number | boolean | null;
}

export interface ActiveFilter {
  id: string;
  field: string;
  operator: Operator;
  /** Selected option values for enum fields. */
  values: string[];
  /** Operands for number fields (`num2` only for `between`). */
  num1: number | null;
  num2: number | null;
}

export interface SavedView {
  id: string;
  name: string;
  filters: ActiveFilter[];
  /** Built-in views can't be deleted. */
  builtin?: boolean;
  star?: boolean;
}
