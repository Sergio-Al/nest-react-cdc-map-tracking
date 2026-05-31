import { FileBarChart, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  useReportsStore,
  type ReportTab,
  type DatePreset,
  type Grain,
} from '@/stores/reports.store';
import { DateRangeControl, CompareControl } from './ToolbarControls';
import { ShareButton, ScheduleButton, ExportButton } from './HeaderActions';

const TAB_IDS: { id: ReportTab; icon?: boolean }[] = [
  { id: 'overview', icon: true },
  { id: 'routes' },
  { id: 'visits' },
  { id: 'drivers' },
  { id: 'vehicles' },
  { id: 'customers' },
];

const PRESET_IDS: DatePreset[] = ['today', 'yesterday', '7d', '14d', '30d', 'mtd', 'qtd', 'ytd'];

const GRAINS: Grain[] = ['hour', 'day', 'week', 'month'];

export function ReportsHeader({ counts }: { counts: Partial<Record<ReportTab, number>> }) {
  const { tab, setTab, preset, setPreset, grain, setGrain } = useReportsStore();
  const { t, i18n } = useTranslation('reports');

  return (
    <>
      {/* Title + tabs */}
      <div className="border-b border-border px-6 pt-4">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-mc-accent-border bg-mc-accent-soft text-mc-accent">
            <FileBarChart className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[18px] font-semibold tracking-[-0.02em] text-foreground">{t('header.title')}</div>
            <div className="mt-0.5 text-xs text-mc-text-muted">{t('header.subtitle')}</div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <ShareButton />
            <ScheduleButton />
            <ExportButton />
          </div>
        </div>

        <div className="-mb-px mt-4 flex gap-0 overflow-x-auto">
          {TAB_IDS.map((entry) => {
            const ct = counts[entry.id];
            const active = entry.id === tab;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={cn(
                  'relative inline-flex items-center gap-1.5 whitespace-nowrap border-b-[1.5px] px-3.5 py-2.5 text-[12.5px] font-medium transition-colors',
                  active
                    ? 'border-mc-accent text-foreground'
                    : 'border-transparent text-mc-text-muted hover:text-foreground',
                )}
              >
                {entry.icon && <BarChart3 className="h-[13px] w-[13px]" />}
                {t(`tabs.${entry.id}`)}
                {ct !== undefined && (
                  <span
                    className={cn(
                      'rounded font-mono text-[10.5px]',
                      'px-1.5 py-px',
                      active ? 'bg-mc-accent-soft text-mc-accent' : 'bg-mc-surface text-mc-text-dim',
                    )}
                  >
                    {ct.toLocaleString(i18n.language)}
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
          {PRESET_IDS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={cn(
                'h-7 rounded-md px-2.5 font-mono text-xs font-medium transition-colors',
                preset === p
                  ? 'bg-mc-surface text-foreground'
                  : 'text-mc-text-muted hover:bg-mc-surface hover:text-foreground',
              )}
            >
              {t(`presets.${p}`)}
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
                  'h-[22px] rounded px-2 font-mono text-[11.5px] font-medium transition-colors',
                  grain === g
                    ? 'bg-mc-elev text-foreground shadow-sm'
                    : 'text-mc-text-muted hover:text-foreground',
                )}
              >
                {t(`grains.${g}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
