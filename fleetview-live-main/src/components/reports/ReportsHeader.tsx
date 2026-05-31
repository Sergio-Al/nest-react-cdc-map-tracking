import { FileBarChart, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useReportsStore,
  type ReportTab,
  type DatePreset,
  type Grain,
} from '@/stores/reports.store';
import { DateRangeControl, CompareControl } from './ToolbarControls';
import { ShareButton, ScheduleButton, ExportButton } from './HeaderActions';

const TABS: { id: ReportTab; label: string; icon?: boolean }[] = [
  { id: 'overview', label: 'Overview', icon: true },
  { id: 'routes', label: 'Routes' },
  { id: 'visits', label: 'Visits' },
  { id: 'drivers', label: 'Drivers' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'customers', label: 'Customers' },
];

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7d' },
  { id: '14d', label: '14d' },
  { id: '30d', label: '30d' },
  { id: 'mtd', label: 'MTD' },
  { id: 'qtd', label: 'QTD' },
  { id: 'ytd', label: 'YTD' },
];

const GRAINS: Grain[] = ['hour', 'day', 'week', 'month'];

export function ReportsHeader({ counts }: { counts: Partial<Record<ReportTab, number>> }) {
  const { tab, setTab, preset, setPreset, grain, setGrain } = useReportsStore();

  return (
    <>
      {/* Title + tabs */}
      <div className="border-b border-border px-6 pt-4">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-mc-accent-border bg-mc-accent-soft text-mc-accent">
            <FileBarChart className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[18px] font-semibold tracking-[-0.02em] text-foreground">Reports</div>
            <div className="mt-0.5 text-xs text-mc-text-muted">
              Operational analytics, leaderboards and exports — La Paz fleet
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <ShareButton />
            <ScheduleButton />
            <ExportButton />
          </div>
        </div>

        <div className="-mb-px mt-4 flex gap-0 overflow-x-auto">
          {TABS.map((t) => {
            const ct = counts[t.id];
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative inline-flex items-center gap-1.5 whitespace-nowrap border-b-[1.5px] px-3.5 py-2.5 text-[12.5px] font-medium transition-colors',
                  active
                    ? 'border-mc-accent text-foreground'
                    : 'border-transparent text-mc-text-muted hover:text-foreground',
                )}
              >
                {t.icon && <BarChart3 className="h-[13px] w-[13px]" />}
                {t.label}
                {ct !== undefined && (
                  <span
                    className={cn(
                      'rounded font-mono text-[10.5px]',
                      'px-1.5 py-px',
                      active ? 'bg-mc-accent-soft text-mc-accent' : 'bg-mc-surface text-mc-text-dim',
                    )}
                  >
                    {ct.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2.5">
        <div className="flex gap-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={cn(
                'h-7 rounded-md px-2.5 font-mono text-xs font-medium transition-colors',
                preset === p.id
                  ? 'bg-mc-surface text-foreground'
                  : 'text-mc-text-muted hover:bg-mc-surface hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <DateRangeControl />

        <CompareControl />

        {tab === 'overview' && (
          <div className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-mc-surface p-0.5">
            {GRAINS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrain(g)}
                className={cn(
                  'h-[22px] rounded px-2 font-mono text-[11.5px] font-medium capitalize transition-colors',
                  grain === g
                    ? 'bg-mc-elev text-foreground shadow-sm'
                    : 'text-mc-text-muted hover:text-foreground',
                )}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
