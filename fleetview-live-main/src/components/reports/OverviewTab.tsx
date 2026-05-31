import { useCallback } from 'react';
import { Filter, ExternalLink, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { exportToCsv } from '@/lib/utils';
import { useRegisterExporter } from '@/hooks/useReportExporter';
import { ReportCard, ReportCardHead, ReportCardBody, HdrIconButton } from './ReportCard';
import { KpiCard } from './KpiCard';
import { TrendChart } from './TrendChart';
import { Heatmap } from './Heatmap';
import { Leaderboard } from './Leaderboard';
import { Insights } from './Insights';
import { barColor } from './tones';
import {
  useReportKpis,
  useReportInsights,
  useServiceLevel,
  useStopDuration,
  useByZone,
  useDriverLeaderboard,
} from '@/hooks/api/useReports';
import { useReportsStore } from '@/stores/reports.store';

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-mc-text-muted">
      <span
        className="rounded-[1px]"
        style={{ background: color, width: line ? 12 : 8, height: line ? 2 : 8 }}
      />
      {label}
    </span>
  );
}

export function OverviewTab() {
  const { from, to, compare } = useReportsStore();
  const showPrev = compare !== 'none';
  const prevLabel = compare === 'previous_year' ? 'Visits (prev year)' : 'Visits (prev period)';
  const kpis = useReportKpis();
  const insights = useReportInsights();
  const serviceLevel = useServiceLevel();
  const stopDuration = useStopDuration();
  const byZone = useByZone();
  const { byVisits } = useDriverLeaderboard(from, to);

  const doExport = useCallback(() => {
    exportToCsv(
      kpis.map((k) => ({
        Metric: k.lbl,
        Value: k.val,
        Unit: k.unit,
        Delta: k.delta,
        Context: k.target,
      })),
      'overview-kpis',
    );
    toast.success('Exported overview KPIs');
  }, [kpis]);
  useRegisterExporter(doExport);

  const maxStop = Math.max(...stopDuration, 1);

  return (
    <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-6 pb-6 pt-[18px]">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <KpiCard key={k.lbl} k={k} />
        ))}
      </div>

      {/* Trend + leaderboard */}
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[2fr_1fr]">
        <ReportCard>
          <ReportCardHead
            title="Visits & On-time"
            sub="last 14 days"
            actions={
              <>
                <span className="hidden items-center gap-3 xl:inline-flex">
                  <Legend color="var(--mc-accent)" label="Visits (current)" />
                  {showPrev && <Legend color="var(--mc-text-dim)" label={prevLabel} line />}
                  <Legend color="oklch(0.72 0.16 150)" label="On-time %" />
                </span>
                <HdrIconButton title="More">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </HdrIconButton>
              </>
            }
          />
          <ReportCardBody className="px-1 pb-1 pt-2.5">
            <TrendChart showPrev={showPrev} />
          </ReportCardBody>
        </ReportCard>

        <ReportCard>
          <ReportCardHead
            title="Top drivers"
            sub="by visits"
            actions={
              <>
                <HdrIconButton title="Filter">
                  <Filter className="h-3.5 w-3.5" />
                </HdrIconButton>
                <HdrIconButton title="Open">
                  <ExternalLink className="h-3.5 w-3.5" />
                </HdrIconButton>
              </>
            }
          />
          <ReportCardBody>
            <Leaderboard rows={byVisits.slice(0, 6)} metric="visits" />
          </ReportCardBody>
        </ReportCard>
      </div>

      {/* Heatmap + insights */}
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[2fr_1fr]">
        <ReportCard>
          <ReportCardHead
            title="Visits by day & hour"
            sub="where the work happens"
            actions={
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-mc-text-dim">
                <span>0</span>
                <span className="flex gap-px">
                  {[
                    'var(--mc-surface)',
                    'oklch(0.72 0.06 50 / 0.3)',
                    'oklch(0.72 0.1 50 / 0.55)',
                    'oklch(0.72 0.14 50 / 0.78)',
                    'oklch(0.72 0.17 50 / 0.95)',
                  ].map((c, i) => (
                    <span key={i} className="h-3 w-3 rounded-[2px]" style={{ background: c }} />
                  ))}
                </span>
                <span>8+</span>
              </span>
            }
          />
          <ReportCardBody className="flex">
            <Heatmap />
          </ReportCardBody>
        </ReportCard>

        <ReportCard>
          <ReportCardHead title="Insights" sub="auto-detected" />
          <ReportCardBody>
            <Insights insights={insights} />
          </ReportCardBody>
        </ReportCard>
      </div>

      {/* Service level + stop duration + by zone */}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
        <ReportCard>
          <ReportCardHead title="Service level" sub="by outcome" />
          <ReportCardBody className="flex flex-col gap-2.5">
            {serviceLevel.map((r) => (
              <div key={r.lbl} className="flex items-center gap-2.5">
                <div className="w-40 text-xs text-mc-text-muted">{r.lbl}</div>
                <div className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-mc-surface">
                  <div
                    className="h-full"
                    style={{ width: `${r.pct}%`, background: barColor(r.cls) }}
                  />
                </div>
                <div className="w-[60px] text-right font-mono text-xs font-semibold text-foreground">
                  {r.ct}
                  <span className="ml-1 text-[10px] font-normal text-mc-text-dim">{r.pct}%</span>
                </div>
              </div>
            ))}
          </ReportCardBody>
        </ReportCard>

        <ReportCard>
          <ReportCardHead title="Stop duration" sub="distribution · minutes" />
          <ReportCardBody className="flex h-[140px] items-end gap-1">
            {stopDuration.map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-t-[3px]"
                  style={{
                    height: `${(h / maxStop) * 100}%`,
                    background: i >= 2 && i <= 5 ? 'var(--mc-accent)' : 'var(--mc-surface-hi)',
                  }}
                />
                <span className="font-mono text-[9px] text-mc-text-dim">
                  {i === 0 ? '<5' : i === stopDuration.length - 1 ? '60+' : `${i * 5}`}
                </span>
              </div>
            ))}
          </ReportCardBody>
        </ReportCard>

        <ReportCard>
          <ReportCardHead title="By zone" sub="distance · km" />
          <ReportCardBody className="flex flex-col gap-2">
            {byZone.map((r) => (
              <div key={r.lbl} className="flex items-center gap-2">
                <div className="w-20 text-[11.5px] text-foreground">{r.lbl}</div>
                <div className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-mc-surface">
                  <div
                    className="h-full"
                    style={{ width: `${r.p * 100}%`, background: 'var(--mc-accent)' }}
                  />
                </div>
                <div className="w-[50px] text-right font-mono text-[11.5px] text-foreground">
                  {r.v}
                </div>
              </div>
            ))}
          </ReportCardBody>
        </ReportCard>
      </div>
    </div>
  );
}
