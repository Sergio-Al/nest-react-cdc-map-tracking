import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FilterBar } from '@/components/filters/FilterBar';
import type { ActiveFilter } from '@/components/filters/types';
import type { ViewWithCount } from '@/components/filters/useDatasetFilters';
import { ROUTE_LIST_FIELDS } from './routeListFilters';
import type { RouteListRow } from './routeListFilters';

interface RouteFiltersProps {
  /** Full (unfiltered) routes — used to derive options and view counts. */
  rows: RouteListRow[];
  filters: ActiveFilter[];
  onChange: (filters: ActiveFilter[]) => void;
  views: ViewWithCount[];
  activeViewId: string;
  onSelectView: (id: string) => void;
  onSaveView: (name: string) => void;
  onDeleteView: (id: string) => void;
}

/**
 * The Routes-page "Filters" entry point: a popover wrapping the shared FilterBar
 * (saved views + active pills + add-filter), driving the same filter model used
 * on the Drivers/Vehicles/Customers pages. The trigger shows the active count.
 */
export function RouteFilters({
  rows,
  filters,
  onChange,
  views,
  activeViewId,
  onSelectView,
  onSaveView,
  onDeleteView,
}: RouteFiltersProps) {
  const { t } = useTranslation('routes');
  const count = filters.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t('page.filters')}
          {count > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-mc-accent px-1 font-mono text-[10px] font-semibold text-mc-accent-fg">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[600px] overflow-hidden p-0">
        <FilterBar<RouteListRow>
          fields={ROUTE_LIST_FIELDS}
          rows={rows}
          filters={filters}
          onChange={onChange}
          views={views}
          activeViewId={activeViewId}
          onSelectView={onSelectView}
          onSaveView={onSaveView}
          onDeleteView={onDeleteView}
        />
      </PopoverContent>
    </Popover>
  );
}
