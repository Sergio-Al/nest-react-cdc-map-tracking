import { useState } from 'react';
import { ChevronLeft, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { newFilter, isComplete } from './engine';
import {
  ENUM_OPERATORS,
  NUMBER_OPERATORS,
  OPERATOR_LABEL,
  type ActiveFilter,
  type FieldDef,
  type Operator,
} from './types';

interface Props<T> {
  fields: FieldDef<T>[];
  rows: T[];
  editing?: ActiveFilter;
  onApply: (f: ActiveFilter) => void;
  align?: 'start' | 'end';
  children: React.ReactNode;
}

export function FilterBuilder<T>({ fields, rows, editing, onApply, align = 'start', children }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'field' | 'value'>('field');
  const [draft, setDraft] = useState<ActiveFilter | null>(null);
  const [search, setSearch] = useState('');

  const def = draft ? fields.find((f) => f.id === draft.field) : undefined;

  const reset = (o: boolean) => {
    setOpen(o);
    if (o) {
      if (editing) {
        setDraft({ ...editing });
        setStep('value');
      } else {
        setDraft(null);
        setStep('field');
      }
      setSearch('');
    }
  };

  const pickField = (f: FieldDef<T>) => {
    const op: Operator = f.kind === 'enum' ? 'any_of' : 'lte';
    setDraft(newFilter(f.id, op));
    setStep('value');
  };

  const apply = () => {
    if (draft && isComplete(draft)) {
      onApply(draft);
      setOpen(false);
    }
  };

  const toggleValue = (v: string) =>
    setDraft((d) => (d ? { ...d, values: d.values.includes(v) ? d.values.filter((x) => x !== v) : [...d.values, v] } : d));

  const options = def?.options ? def.options(rows).filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : [];

  return (
    <Popover open={open} onOpenChange={reset}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-0">
        {step === 'field' && (
          <div className="max-h-72 overflow-y-auto p-1">
            {fields.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => pickField(f)}
                className="flex w-full items-center rounded-[5px] px-2 py-1.5 text-left text-xs text-foreground hover:bg-mc-surface"
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {step === 'value' && draft && def && (
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-2">
              {!editing && (
                <button
                  type="button"
                  onClick={() => setStep('field')}
                  className="grid h-5 w-5 place-items-center rounded text-mc-text-dim hover:bg-mc-surface hover:text-foreground"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              )}
              <span className="text-xs font-semibold text-foreground">{def.label}</span>
            </div>

            {def.kind === 'enum' ? (
              <>
                <div className="flex gap-1 border-b border-border p-1.5">
                  {ENUM_OPERATORS.map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => setDraft((d) => (d ? { ...d, operator: op } : d))}
                      className={cn(
                        'h-6 flex-1 rounded text-[11px] font-medium transition-colors',
                        draft.operator === op
                          ? 'bg-mc-surface text-foreground'
                          : 'text-mc-text-muted hover:text-foreground',
                      )}
                    >
                      {OPERATOR_LABEL[op]}
                    </button>
                  ))}
                </div>
                {def.options && def.options(rows).length > 8 && (
                  <div className="border-b border-border p-1.5">
                    <Input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search…"
                      className="h-7 text-xs"
                    />
                  </div>
                )}
                <div className="max-h-56 overflow-y-auto p-1">
                  {options.length === 0 && (
                    <div className="px-2 py-3 text-center text-[11px] text-mc-text-dim">No options</div>
                  )}
                  {options.map((o) => {
                    const on = draft.values.includes(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => toggleValue(o.value)}
                        className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-xs hover:bg-mc-surface"
                      >
                        <span
                          className={cn(
                            'grid h-3.5 w-3.5 place-items-center rounded border-[1.5px]',
                            on
                              ? 'border-mc-accent bg-mc-accent text-mc-accent-fg'
                              : 'border-mc-border-strong text-transparent',
                          )}
                        >
                          {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                        </span>
                        <span className="truncate text-foreground">{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2 p-2.5">
                <div className="flex flex-wrap gap-1">
                  {NUMBER_OPERATORS.map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => setDraft((d) => (d ? { ...d, operator: op } : d))}
                      className={cn(
                        'h-6 min-w-[26px] rounded px-1.5 font-mono text-[11px] font-medium transition-colors',
                        draft.operator === op
                          ? 'bg-mc-accent text-mc-accent-fg'
                          : 'bg-mc-surface text-mc-text-muted hover:text-foreground',
                      )}
                    >
                      {OPERATOR_LABEL[op]}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    autoFocus
                    value={draft.num1 ?? ''}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, num1: e.target.value === '' ? null : Number(e.target.value) } : d))
                    }
                    onKeyDown={(e) => e.key === 'Enter' && apply()}
                    placeholder="value"
                    className="h-7 text-xs"
                  />
                  {draft.operator === 'between' && (
                    <>
                      <span className="text-xs text-mc-text-dim">and</span>
                      <Input
                        type="number"
                        value={draft.num2 ?? ''}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, num2: e.target.value === '' ? null : Number(e.target.value) } : d))
                        }
                        onKeyDown={(e) => e.key === 'Enter' && apply()}
                        placeholder="value"
                        className="h-7 text-xs"
                      />
                    </>
                  )}
                  {def.unit && <span className="text-xs text-mc-text-dim">{def.unit.trim()}</span>}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-1.5 border-t border-border p-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-7 rounded-md px-2.5 text-[11.5px] font-medium text-mc-text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!isComplete(draft)}
                className="h-7 rounded-md bg-mc-accent px-3 text-[11.5px] font-medium text-mc-accent-fg hover:bg-mc-accent-strong disabled:opacity-50"
              >
                {editing ? 'Update' : 'Add filter'}
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
