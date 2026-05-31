import { useState, useMemo } from 'react';
import {
  Play,
  Download,
  Share2,
  CircleDashed,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/playback.store';
import {
  tripSummaryFrom,
  getMockSegments,
  getMockTimeComposition,
  fmtDuration,
} from '@/lib/mock/historyMock';
import { useDateLocale } from '@/i18n/useDateLocale';
import type { Driver } from '@/types/driver.types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type Tab = 'summary' | 'segments' | 'events' | 'stops';

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('');
}

interface RouteHistoryDetailProps {
  driver: Driver | null;
}

export function RouteHistoryDetail({ driver }: RouteHistoryDetailProps) {
  const { positions, goToStart, play } = usePlaybackStore();
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const { t } = useTranslation('history');
  const dateLocale = useDateLocale();

  const hasPositions = positions.length > 0;

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!hasPositions || !driver) {
    return (
      <aside className="flex w-[340px] shrink-0 flex-col border-l border-border bg-background">
        <div className="flex flex-1 flex-col items-center justify-center gap-[10px] p-8 text-center">
          <div
            className="grid h-11 w-11 place-items-center rounded-[12px] border border-border bg-mc-surface text-mc-text-dim"
          >
            <CircleDashed className="h-5 w-5" />
          </div>
          <div className="mt-1 text-[13px] font-semibold text-foreground">{t('detail.empty.title')}</div>
          <div className="max-w-[220px] text-[11.5px] leading-relaxed text-muted-foreground">
            {t('detail.empty.body')}
          </div>
        </div>
      </aside>
    );
  }

  const summary = tripSummaryFrom(positions);
  const segments = getMockSegments(driver.id);
  const timeComp = getMockTimeComposition();
  const dateStr = format(new Date(positions[0].time), 'd MMM', { locale: dateLocale });

  const handleReplay = () => {
    goToStart();
    play();
  };

  const TABS: { id: Tab; count?: number }[] = [
    { id: 'summary' },
    { id: 'segments', count: segments.length },
    { id: 'events', count: 12 },
    { id: 'stops', count: 4 },
  ];

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-border bg-background">
      {/* Panel head */}
      <div className="border-b border-border px-4 py-[14px]">
        <div className="flex items-center gap-[9px]">
          <span
            className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mc-accent-soft font-mono text-[11px] font-bold text-mc-accent"
          >
            {initials(driver.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">{driver.name}</div>
            <div className="font-mono text-[11px] text-mc-text-dim">
              {driver.vehiclePlate ?? '—'} · {dateStr} · {t('detail.tripSuffix', { id: 482 })}
            </div>
          </div>
          <span
            className="flex items-center gap-1 rounded-[5px] border border-[oklch(0.72_0.16_150/0.35)] bg-[oklch(0.72_0.16_150/0.12)] px-[7px] py-[2px] font-mono text-[10.5px] font-medium"
            style={{ color: 'var(--mc-status-moving)' }}
          >
            <span
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: 'var(--mc-status-moving)' }}
            />
            {t('detail.statusComplete')}
          </span>
        </div>

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleReplay}
            className="flex h-8 items-center gap-[6px] rounded-mc bg-mc-accent px-3 text-[12px] font-medium text-white hover:bg-mc-accent-strong"
          >
            <Play className="h-[13px] w-[13px]" />
            <span>{t('detail.actions.replay')}</span>
          </button>
          <button
            type="button"
            className="flex h-8 items-center gap-[6px] rounded-mc border border-border bg-mc-elev px-3 text-[12px] font-medium text-muted-foreground hover:bg-mc-surface hover:text-foreground"
          >
            <Download className="h-[13px] w-[13px]" />
            <span>{t('detail.actions.gpx')}</span>
          </button>
          <button
            type="button"
            className="flex h-8 items-center gap-[6px] rounded-mc border border-border bg-mc-elev px-3 text-[12px] font-medium text-muted-foreground hover:bg-mc-surface hover:text-foreground"
          >
            <Share2 className="h-[13px] w-[13px]" />
            <span>{t('detail.actions.share')}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex h-9 items-center gap-1.5 px-4 text-[12px] font-medium transition-colors',
              activeTab === tab.id
                ? 'border-b-2 border-mc-accent text-mc-accent'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`detail.tabs.${tab.id}`)}
            {tab.count !== undefined && (
              <span className="font-mono text-[10px] text-mc-text-dim">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'summary' && (
          <SummaryTab summary={summary} timeComp={timeComp} segments={segments} />
        )}
        {activeTab === 'segments' && (
          <SegmentsTab segments={segments} />
        )}
        {activeTab === 'events' && <MockPlaceholderTab kind="events" />}
        {activeTab === 'stops' && <MockPlaceholderTab kind="stops" />}
      </div>
    </aside>
  );
}

// ── Summary tab ───────────────────────────────────────────────────────────────
import type { TripSummary, TimeComposition, MockSegment } from '@/lib/mock/historyMock';

function SummaryTab({
  summary,
  timeComp,
  segments,
}: {
  summary: TripSummary;
  timeComp: TimeComposition;
  segments: MockSegment[];
}) {
  const { t } = useTranslation('history');
  const movePct = Math.round((timeComp.movingMin  / timeComp.totalMin) * 100);
  const stopPct = Math.round((timeComp.stoppedMin / timeComp.totalMin) * 100);
  const idlePct = Math.round((timeComp.idleMin    / timeComp.totalMin) * 100);
  const offPct  = Math.round((timeComp.offlineMin / timeComp.totalMin) * 100);

  return (
    <div className="flex flex-col gap-0">
      {/* Trip overview */}
      <div className="border-b border-border px-4 py-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
          {t('detail.summary.tripOverview')}
        </div>
        <div
          className="overflow-hidden rounded-[8px] border border-border bg-mc-elev"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}
        >
          <StatCell lbl={t('detail.summary.distance')}  val={`${summary.distanceKm}`}    unit="km"   />
          <StatCell lbl={t('detail.summary.duration')}  val={fmtDuration(summary.durationMin)} unit="" noBorderR />
          <StatCell lbl={t('detail.summary.avgSpeed')} val={`${summary.avgSpeedKmh}`}   unit="km/h" delta={summary.avgSpeedDelta}  noBorderB />
          <StatCell lbl={t('detail.summary.topSpeed')} val={`${summary.topSpeedKmh}`}   unit="km/h" noBorderR noBorderB />
          <StatCell lbl={t('detail.summary.stops')}     val={`${summary.stops}`}          unit={t('detail.summary.ofTen')} extraRow />
          <StatCell lbl={t('detail.summary.idleTime')} val={`${summary.idleMin}`}        unit={t('detail.summary.minUnit')}  delta={summary.idleDelta} noBorderR extraRow />
        </div>
      </div>

      {/* Time composition */}
      <div className="border-b border-border px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
          <span>{t('detail.summary.timeComposition')}</span>
          <span className="font-mono normal-case tracking-normal text-muted-foreground">
            {fmtDuration(timeComp.totalMin)}
          </span>
        </div>
        {/* Bar */}
        <div className="flex h-2 overflow-hidden rounded-full">
          <span className="h-full bg-status-moving"  style={{ width: `${movePct}%` }} />
          <span className="h-full bg-mc-accent"      style={{ width: `${stopPct}%` }} />
          <span className="h-full bg-status-idle"    style={{ width: `${idlePct}%` }} />
          <span className="h-full bg-mc-border-strong" style={{ width: `${offPct}%` }} />
        </div>
        {/* Legend */}
        <div className="mt-[10px] grid grid-cols-4 gap-2 font-mono text-[10.5px] text-muted-foreground">
          <div>
            <span style={{ color: 'var(--mc-status-moving)' }}>● </span>
            {t('detail.summary.moving')}<br />
            <span className="text-[12px] text-foreground">{fmtDuration(timeComp.movingMin)}</span>
          </div>
          <div>
            <span style={{ color: 'var(--mc-accent)' }}>● </span>
            {t('detail.summary.stopped')}<br />
            <span className="text-[12px] text-foreground">{fmtDuration(timeComp.stoppedMin)}</span>
          </div>
          <div>
            <span style={{ color: 'var(--mc-status-idle)' }}>● </span>
            {t('detail.summary.idle')}<br />
            <span className="text-[12px] text-foreground">{t('detail.summary.minSuffix', { count: timeComp.idleMin })}</span>
          </div>
          <div>
            <span style={{ color: 'var(--mc-text-dim)' }}>● </span>
            {t('detail.summary.offline')}<br />
            <span className="text-[12px] text-foreground">{t('detail.summary.minSuffix', { count: timeComp.offlineMin })}</span>
          </div>
        </div>
      </div>

      {/* Segments preview */}
      <div className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
          <span>{t('detail.summary.segmentsHeader')}</span>
          <span className="font-mono normal-case tracking-normal text-muted-foreground">
            {segments.length}
          </span>
        </div>
        <SegmentList segments={segments.slice(0, 4)} />
      </div>
    </div>
  );
}

function StatCell({
  lbl,
  val,
  unit,
  delta,
  noBorderR,
  noBorderB,
  extraRow,
}: {
  lbl: string;
  val: string;
  unit: string;
  delta?: number;
  noBorderR?: boolean;
  noBorderB?: boolean;
  extraRow?: boolean;
}) {
  return (
    <div
      className={cn(
        'px-3 py-[10px]',
        !noBorderR && 'border-r border-border',
        !noBorderB && !extraRow && 'border-b border-border',
        extraRow && 'border-t border-border',
      )}
    >
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
        {lbl}
      </div>
      <div className="mt-1 font-mono text-[17px] font-semibold leading-none tracking-[-0.01em]">
        {val}
        {unit && (
          <span className="ml-[3px] text-[11px] font-normal text-mc-text-dim">{unit}</span>
        )}
        {delta !== undefined && (
          <span
            className={cn(
              'ml-[6px] inline-flex items-center font-mono text-[10px]',
              delta >= 0 ? 'text-status-moving' : 'text-status-offline',
            )}
          >
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Segments tab ──────────────────────────────────────────────────────────────
function SegmentsTab({ segments }: { segments: MockSegment[] }) {
  return (
    <div className="px-4 py-3">
      <SegmentList segments={segments} />
    </div>
  );
}

function SegmentList({ segments }: { segments: MockSegment[] }) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-border bg-mc-elev">
      {segments.map((s, i) => (
        <div
          key={i}
          className={cn(
            'grid items-center gap-[10px] py-[9px] pr-3',
            i < segments.length - 1 && 'border-b border-border',
          )}
          style={{ gridTemplateColumns: '6px 1fr auto' }}
        >
          {/* Colored bar */}
          <span
            className={cn(
              'ml-[10px] w-[3px] self-stretch rounded-[2px]',
              s.kind === 'move' && 'bg-status-moving',
              s.kind === 'idle' && 'bg-status-idle',
              s.kind === 'stop' && 'bg-mc-accent',
              s.kind === 'off'  && 'bg-mc-border-strong',
            )}
            style={{ marginTop: 6, marginBottom: 6 }}
          />
          {/* Body */}
          <div className="min-w-0">
            <div className="flex items-center gap-[6px] text-[12.5px] font-medium">
              <span className="truncate">{s.name}</span>
              <span
                className={cn(
                  'shrink-0 rounded-[4px] px-[5px] py-[1px] font-mono text-[9.5px] uppercase tracking-[0.05em]',
                  s.kind === 'move' && 'text-[oklch(0.72_0.16_150)] bg-[oklch(0.72_0.16_150/0.18)]',
                  s.kind === 'idle' && 'text-[oklch(0.78_0.14_80)] bg-[oklch(0.78_0.14_80/0.22)]',
                  s.kind === 'stop' && 'text-mc-accent bg-mc-accent-soft',
                  s.kind === 'off'  && 'text-muted-foreground bg-mc-surface',
                )}
              >
                {s.tag}
              </span>
            </div>
            <div className="mt-[2px] font-mono text-[11px] text-muted-foreground">
              {s.time} · {s.dur}{s.dist !== '—' ? ` · ${s.dist}` : ''}
            </div>
          </div>
          {/* Meta */}
          <div className="text-right">
            <div className="font-mono text-[11.5px] font-semibold text-foreground">{s.dur}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MockPlaceholderTab({ kind }: { kind: 'events' | 'stops' }) {
  const { t } = useTranslation('history');
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-[10px] border border-border bg-mc-surface text-mc-text-dim">
        <CircleDashed className="h-5 w-5" />
      </div>
      <div className="text-[12px] text-muted-foreground">
        {t(`detail.placeholder.${kind}`)}
        <br />
        {t('detail.placeholder.body')}
      </div>
    </div>
  );
}
