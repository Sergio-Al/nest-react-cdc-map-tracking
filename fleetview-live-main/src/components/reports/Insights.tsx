import { AlertTriangle, TrendingUp, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReportInsight, InsightTone } from '@/lib/mock/reportsMock';

const ICONS: Record<InsightTone, LucideIcon> = {
  warn: AlertTriangle,
  good: TrendingUp,
  info: Sparkles,
};

const ICON_BOX: Record<InsightTone, string> = {
  warn: 'bg-[oklch(0.78_0.14_80_/_0.18)] border-[oklch(0.78_0.14_80_/_0.4)] text-[oklch(0.55_0.14_80)] dark:text-[oklch(0.85_0.16_80)]',
  good: 'bg-[oklch(0.72_0.16_150_/_0.18)] border-[oklch(0.72_0.16_150_/_0.4)] text-[oklch(0.45_0.16_150)] dark:text-[oklch(0.85_0.18_150)]',
  info: 'bg-mc-accent-soft border-mc-accent-border text-mc-accent',
};

export function Insights({ insights }: { insights: ReportInsight[] }) {
  return (
    <div className="flex flex-col gap-2">
      {insights.map((ins, i) => {
        const Icon = ICONS[ins.tone];
        return (
          <div
            key={i}
            className="grid grid-cols-[26px_1fr_auto] items-center gap-2.5 rounded-lg border border-border bg-background p-2.5"
          >
            <div
              className={cn(
                'grid h-[26px] w-[26px] place-items-center rounded-[7px] border',
                ICON_BOX[ins.tone],
              )}
            >
              <Icon className="h-[13px] w-[13px]" />
            </div>
            <div className="min-w-0 text-xs leading-relaxed text-foreground">
              <strong className="font-semibold">{ins.title}</strong>{' '}
              {ins.num && <span className="font-mono font-semibold">{ins.num}</span>}{' '}
              <span className="text-mc-text-muted">{ins.body}</span>
            </div>
            <button
              type="button"
              className="self-center whitespace-nowrap px-1 text-[11px] font-semibold text-mc-accent hover:underline"
            >
              {ins.cta} →
            </button>
          </div>
        );
      })}
    </div>
  );
}
