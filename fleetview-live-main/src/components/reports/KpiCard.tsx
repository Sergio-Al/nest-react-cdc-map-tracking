import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Sparkline } from './Sparkline';
import { deltaChip } from './tones';
import type { ReportKpi } from '@/lib/mock/reportsMock';

const KPI_KEYS: Record<string, string> = {
  Visits: 'visits',
  Distance: 'distance',
  'On-time': 'ontime',
  'Idle time': 'idleTime',
  'Avg speed': 'avgSpeed',
  Active: 'active',
};

const KPI_UNIT_KEYS: Record<string, string> = {
  completed: 'completed',
  km: 'km',
  '%': 'percent',
  'h 22m': 'hm',
  'km/h': 'kmh',
  '/ 9': 'of9',
};

const KPI_TARGET_KEYS: Record<string, string> = {
  'Goal · 1,200': 'goal1200',
  '+260 km vs last': 'plus260km',
  'Goal · 95%': 'goal95',
  'Lower is better': 'lowerBetter',
  Steady: 'steady',
  '1 vehicle off': 'oneOff',
};

export function KpiCard({ k }: { k: ReportKpi }) {
  const { t, i18n } = useTranslation('reports');
  const sym = k.dir === 'up' ? '▲' : k.dir === 'down' ? '▼' : '–';

  const labelKey = KPI_KEYS[k.lbl];
  const unitKey = KPI_UNIT_KEYS[k.unit];
  const targetKey = KPI_TARGET_KEYS[k.target];
  const label = labelKey ? t(`overview.kpi.${labelKey}`) : k.lbl;
  const unit = unitKey ? t(`overview.kpiUnits.${unitKey}`) : k.unit;
  const target = targetKey ? t(`overview.kpiTargets.${targetKey}`) : k.target;

  return (
    <div className="group relative flex flex-col gap-1.5 overflow-hidden rounded-[10px] border border-border bg-mc-elev px-3.5 py-3 transition-colors hover:border-mc-border-strong">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mc-text-dim">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <div className="font-mono text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          {k.val.toLocaleString(i18n.language)}
          <span className="ml-0.5 text-xs font-normal text-mc-text-dim">{unit}</span>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 rounded font-mono text-[10.5px] font-semibold',
            'px-1.5 py-px',
            deltaChip(k.dir),
          )}
        >
          {sym} {k.delta}
        </span>
      </div>
      <div className="font-mono text-[10px] text-mc-text-dim">
        {t('overview.kpiVsPrev')} · <span>{target}</span>
      </div>
      <div className="mt-0.5 h-[26px]">
        <Sparkline
          data={k.spark}
          height={26}
          color={k.dir === 'down' ? 'var(--mc-status-offline)' : 'var(--mc-accent)'}
        />
      </div>
    </div>
  );
}
