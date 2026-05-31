import { useState } from 'react';
import { Plus, X, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { FilterBuilder } from './FilterBuilder';
import { describeFilter } from './engine';
import type { ActiveFilter, FieldDef } from './types';
import type { ViewWithCount } from './useDatasetFilters';

function NewViewButton({ onSave }: { onSave: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const { t } = useTranslation('common');
  const save = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName('');
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="ml-auto px-2 py-1.5 text-[11px] text-mc-text-dim hover:text-foreground">
          {t('filters.newView')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 space-y-2 p-2.5">
        <div className="text-[11px] font-medium text-mc-text-muted">{t('filters.saveViewTitle')}</div>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder={t('filters.viewNamePlaceholder')}
          className="h-8 text-xs"
        />
        <button
          type="button"
          onClick={save}
          disabled={!name.trim()}
          className="inline-flex h-8 w-full items-center justify-center rounded-md bg-mc-accent text-xs font-medium text-mc-accent-fg hover:bg-mc-accent-strong disabled:opacity-50"
        >
          {t('filters.saveView')}
        </button>
      </PopoverContent>
    </Popover>
  );
}

interface Props<T> {
  fields: FieldDef<T>[];
  rows: T[];
  filters: ActiveFilter[];
  onChange: (filters: ActiveFilter[]) => void;
  views: ViewWithCount[];
  activeViewId: string;
  onSelectView: (id: string) => void;
  onSaveView: (name: string) => void;
  onDeleteView: (id: string) => void;
  /** Optional badge shown when the table is on labeled-mock fallback data. */
  isMock?: boolean;
}

export function FilterBar<T>({
  fields,
  rows,
  filters,
  onChange,
  views,
  activeViewId,
  onSelectView,
  onSaveView,
  onDeleteView,
  isMock,
}: Props<T>) {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const { t, i18n } = useTranslation('common');

  const addFilter = (f: ActiveFilter) => onChange([...filters, f]);
  const replaceFilter = (f: ActiveFilter) => onChange(filters.map((x) => (x.id === f.id ? f : x)));
  const removeFilter = (id: string) => onChange(filters.filter((x) => x.id !== id));

  return (
    <>
      {/* Saved / preset views */}
      <div className="flex items-center border-b border-border px-6">
        {views.map((v) => {
          const active = v.id === activeViewId;
          return (
            <span key={v.id} className="group inline-flex items-center">
              <button
                type="button"
                onClick={() => onSelectView(v.id)}
                className={cn(
                  '-mb-px inline-flex items-center gap-1.5 border-b-[1.5px] px-3 py-2 text-xs font-medium transition-colors',
                  active ? 'border-mc-accent text-foreground' : 'border-transparent text-mc-text-muted hover:text-foreground',
                )}
              >
                {v.star && <Star className="h-3 w-3 fill-mc-accent text-mc-accent" />}
                {v.nameKey ? t(v.nameKey) : v.name}
                <span className={cn('font-mono text-[10px]', active ? 'text-mc-accent' : 'text-mc-text-dim')}>
                  {v.count.toLocaleString(i18n.language)}
                </span>
              </button>
              {!v.builtin && (
                <button
                  type="button"
                  onClick={() => onDeleteView(v.id)}
                  title={t('filters.deleteView')}
                  className="-ml-1 grid h-4 w-4 place-items-center rounded text-mc-text-dim opacity-0 hover:bg-mc-surface hover:text-foreground group-hover:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          );
        })}
        <NewViewButton onSave={onSaveView} />
      </div>

      {/* Active filter pills */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-6 py-2.5">
        {filters.map((f) => {
          const def = byId.get(f.field);
          if (!def) return null;
          const { key, value } = describeFilter(f, def, rows);
          return (
            <span
              key={f.id}
              className="inline-flex h-[26px] items-center rounded-md border border-border bg-mc-surface text-[11.5px] font-medium text-foreground"
            >
              <FilterBuilder fields={fields} rows={rows} editing={f} onApply={replaceFilter}>
                <button type="button" className="flex h-full items-center gap-1.5 rounded-l-md px-2 hover:bg-mc-surface-hi">
                  <span className="text-mc-text-muted">{key}</span>
                  <span className="text-mc-text-dim">·</span>
                  <span className="font-mono font-semibold">{value}</span>
                </button>
              </FilterBuilder>
              <button
                type="button"
                onClick={() => removeFilter(f.id)}
                className="grid h-full w-5 place-items-center rounded-r-md text-mc-text-dim hover:bg-mc-surface-hi hover:text-foreground"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          );
        })}

        <FilterBuilder fields={fields} rows={rows} onApply={addFilter}>
          <button
            type="button"
            className="inline-flex h-[26px] items-center gap-1.5 rounded-md border border-dashed border-mc-border-strong bg-mc-elev px-2 text-[11.5px] font-medium text-mc-text-dim hover:border-mc-accent-border hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            {t('filters.addFilter')}
          </button>
        </FilterBuilder>

        {isMock && (
          <span className="ml-2 rounded bg-mc-surface px-2 py-0.5 font-mono text-[10px] text-mc-text-dim">
            {t('filters.demoData')}
          </span>
        )}
      </div>
    </>
  );
}
