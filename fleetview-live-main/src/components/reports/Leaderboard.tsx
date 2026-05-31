import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { deltaText } from './tones';
import type { LeaderRow } from '@/hooks/api/useReports';

type Metric = 'visits' | 'otp' | 'km';

function metricValue(r: LeaderRow, metric: Metric): string {
  if (metric === 'otp') return `${r.otp}%`;
  if (metric === 'km') return `${r.km} km`;
  return String(r.visits);
}

function metricRaw(r: LeaderRow, metric: Metric): number {
  return metric === 'otp' ? r.otp : metric === 'km' ? r.km : r.visits;
}

export function Leaderboard({ rows, metric = 'visits' }: { rows: LeaderRow[]; metric?: Metric }) {
  const { t } = useTranslation('reports');
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-mc-text-dim">
        {t('leaderboard.noActivity')}
      </div>
    );
  }
  const max = Math.max(...rows.map((r) => metricRaw(r, metric)), 1);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div
          key={r.driverId}
          className="grid grid-cols-[24px_28px_1fr_auto] items-center gap-2.5"
        >
          <div className="text-right font-mono text-[10.5px] font-semibold text-mc-text-dim">
            #{i + 1}
          </div>
          <div className="grid h-[26px] w-[26px] place-items-center rounded-full border border-mc-accent-border bg-mc-accent-soft font-mono text-[10.5px] font-bold text-mc-accent">
            {r.initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-medium tracking-[-0.005em] text-foreground">
              {r.name}
            </div>
            <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-mc-surface">
              <div
                className="h-full"
                style={{
                  width: `${(metricRaw(r, metric) / max) * 100}%`,
                  background: 'linear-gradient(90deg, var(--mc-accent), var(--mc-accent-strong))',
                }}
              />
            </div>
          </div>
          <div className="text-right font-mono text-[11.5px]">
            <div className="font-semibold text-foreground">{metricValue(r, metric)}</div>
            <div className={cn('mt-px block text-[9.5px]', deltaText(r.dir))}>
              {r.dir === 'up' ? '▲' : r.dir === 'down' ? '▼' : ''} {r.delta}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
