import { cn } from '@/lib/utils';
import { Sparkline } from './Sparkline';
import { deltaChip } from './tones';
import type { ReportKpi } from '@/lib/mock/reportsMock';

export function KpiCard({ k }: { k: ReportKpi }) {
  const sym = k.dir === 'up' ? '▲' : k.dir === 'down' ? '▼' : '–';
  return (
    <div className="group relative flex flex-col gap-1.5 overflow-hidden rounded-[10px] border border-border bg-mc-elev px-3.5 py-3 transition-colors hover:border-mc-border-strong">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mc-text-dim">
        {k.lbl}
      </div>
      <div className="flex items-baseline gap-2">
        <div className="font-mono text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          {k.val.toLocaleString()}
          <span className="ml-0.5 text-xs font-normal text-mc-text-dim">{k.unit}</span>
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
        vs prev period · <span>{k.target}</span>
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
