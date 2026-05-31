import i18n from '@/i18n';
import { type ActiveFilter, type FieldDef, type Operator } from './types';

/** A filter only takes effect once it has enough operands to evaluate. */
export function isComplete(f: ActiveFilter): boolean {
  if (f.operator === 'any_of' || f.operator === 'not_any_of') return f.values.length > 0;
  if (f.operator === 'between') return f.num1 != null && f.num2 != null;
  return f.num1 != null;
}

function matches<T>(row: T, f: ActiveFilter, def: FieldDef<T>): boolean {
  const v = def.get(row);
  if (def.kind === 'enum') {
    const s = v == null ? '' : String(v);
    return f.operator === 'not_any_of' ? !f.values.includes(s) : f.values.includes(s);
  }
  if (typeof v !== 'number') return false;
  const a = f.num1 ?? 0;
  switch (f.operator) {
    case 'lt':
      return v < a;
    case 'lte':
      return v <= a;
    case 'eq':
      return v === a;
    case 'gte':
      return v >= a;
    case 'gt':
      return v > a;
    case 'between': {
      const b = f.num2 ?? a;
      return v >= Math.min(a, b) && v <= Math.max(a, b);
    }
    default:
      return true;
  }
}

/** Apply complete filters with AND semantics. Incomplete filters are ignored. */
export function applyFilters<T>(rows: T[], filters: ActiveFilter[], fields: FieldDef<T>[]): T[] {
  const active = filters.filter(isComplete);
  if (active.length === 0) return rows;
  const byId = new Map(fields.map((f) => [f.id, f]));
  return rows.filter((row) =>
    active.every((f) => {
      const def = byId.get(f.field);
      return def ? matches(row, f, def) : true;
    }),
  );
}

/** Human-readable `key · value` for a filter pill. */
export function describeFilter<T>(
  f: ActiveFilter,
  def: FieldDef<T>,
  rows: T[],
): { key: string; value: string } {
  const fieldLabel = def.labelKey ? i18n.t(def.labelKey, { ns: 'common' }) : def.label;
  const key = fieldLabel.toLowerCase();
  const tOp = (op: Operator) => i18n.t(`filters.operators.${op}`, { ns: 'common' });
  const tOpt = (o: { label: string; labelKey?: string }) =>
    o.labelKey ? i18n.t(o.labelKey, { ns: 'common' }) : o.label;
  if (def.kind === 'enum') {
    const opts = def.options ? def.options(rows) : [];
    const labels = f.values.map((val) => {
      const o = opts.find((x) => x.value === val);
      return o ? tOpt(o) : val;
    });
    const shown = labels.slice(0, 2).join(', ');
    const extra = labels.length > 2 ? `, +${labels.length - 2}` : '';
    const prefix = f.operator === 'not_any_of' ? `${tOp('not_any_of')} ` : '';
    return { key, value: `${prefix}${shown}${extra}` || '—' };
  }
  const unit = def.unit ?? '';
  if (f.operator === 'between') return { key, value: `${f.num1}–${f.num2}${unit}` };
  return { key, value: `${tOp(f.operator)} ${f.num1}${unit}` };
}

export function newFilter(fieldId: string, operator: Operator): ActiveFilter {
  return { id: crypto.randomUUID(), field: fieldId, operator, values: [], num1: null, num2: null };
}
