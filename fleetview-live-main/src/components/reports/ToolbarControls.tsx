import { ChevronDown, GitCompareArrows } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import {
  useReportsStore,
  COMPARE_LABELS,
  type CompareMode,
} from '@/stores/reports.store';

export function DateRangeControl() {
  const { from, to, setRange } = useReportsStore();
  return <DateRangePicker from={from} to={to} onChange={setRange} className="ml-1" />;
}

export function CompareControl() {
  const { compare, setCompare } = useReportsStore();
  return (
    <div className="ml-1 inline-flex items-center gap-1.5 border-l border-border pl-3 text-xs text-mc-text-muted">
      <span>Compare</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded bg-mc-surface px-1.5 py-1 font-mono text-[10.5px] text-mc-text-muted transition-colors hover:text-foreground"
          >
            <GitCompareArrows className="h-3 w-3 text-mc-text-dim" />
            {COMPARE_LABELS[compare]}
            <ChevronDown className="h-3 w-3 text-mc-text-dim" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuRadioGroup
            value={compare}
            onValueChange={(v) => setCompare(v as CompareMode)}
          >
            <DropdownMenuRadioItem value="previous_period" className="text-xs">
              Previous period
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="previous_year" className="text-xs">
              Previous year
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="none" className="text-xs">
              No comparison
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
