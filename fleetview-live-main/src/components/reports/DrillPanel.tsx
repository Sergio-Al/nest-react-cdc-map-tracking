import { X, ExternalLink, Download, Share2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Sparkline } from './Sparkline';
import { avatarTone, statusPill, stopTone } from './tones';
import { useRouteDrilldown } from '@/hooks/api/useReports';
import type { RouteDisplayStatus } from '@/hooks/api/useReports';

function StatCell({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="border-r border-border px-[11px] py-[9px] last:border-r-0 [&:nth-child(3n)]:border-r-0">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
        {label}
      </div>
      <div className="mt-[3px] font-mono text-sm font-semibold text-foreground">
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-normal text-mc-text-dim">{unit}</span>}
      </div>
    </div>
  );
}

function SectionHd({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
      <span>{title}</span>
      {meta && <span className="font-mono normal-case tracking-normal text-mc-text-muted">{meta}</span>}
    </div>
  );
}

export function DrillPanel({
  routeId,
  fallbackName,
  fallbackStatus,
  onClose,
}: {
  routeId: string;
  fallbackName?: string;
  fallbackStatus?: RouteDisplayStatus;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const d = useRouteDrilldown(routeId, fallbackName);
  const status = (d.route?.status as RouteDisplayStatus | undefined) ?? fallbackStatus ?? 'completed';
  const otpLabel = `${d.route?.totalStops ? Math.round((d.route.completedStops / d.route.totalStops) * 100) : 96}% on-time`;

  return (
    <aside className="flex w-[420px] min-h-0 shrink-0 flex-col border-l border-border bg-background">
      <div className="border-b border-border px-4 pb-3 pt-3.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-[11px] text-mc-text-dim">Routes</span>
          <span className="text-mc-text-dim">/</span>
          <span className="font-mono text-[11px] text-mc-text-muted">
            {d.route?.scheduledDate ?? '—'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid h-[22px] w-[22px] place-items-center rounded-[5px] text-mc-text-dim hover:bg-mc-surface hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'grid h-8 w-8 place-items-center rounded-full font-mono text-[11.5px] font-bold',
              avatarTone('green'),
            )}
          >
            {d.initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {d.driverName} · Route
            </div>
            <div className="font-mono text-[11px] text-mc-text-muted">
              {d.plate} · {d.durationLabel} · #{routeId.slice(0, 6)}
            </div>
          </div>
        </div>

        <div className="mt-1.5 flex items-center gap-2 font-mono text-[11.5px] text-mc-text-muted">
          <span
            className={cn(
              'inline-flex h-[19px] items-center gap-1 rounded-full px-[7px] text-[10.5px] font-semibold',
              statusPill(status),
            )}
          >
            <span className="h-[5px] w-[5px] rounded-full bg-current" />
            {status === 'in_progress' ? 'in progress' : status}
          </span>
          <span>·</span>
          <span>
            {d.route?.completedStops ?? 0}/{d.route?.totalStops ?? 0} stops
          </span>
          <span>·</span>
          <span>{otpLabel}</span>
        </div>

        <div className="mt-3 flex gap-1.5">
          <button
            type="button"
            onClick={() => navigate('/routes')}
            className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] bg-mc-accent text-[11.5px] font-medium text-mc-accent-fg hover:bg-mc-accent-strong"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open route
          </button>
          <button
            type="button"
            className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] border border-border bg-mc-elev text-[11.5px] font-medium text-foreground hover:border-mc-border-strong"
          >
            <Download className="h-3.5 w-3.5" />
            GPX
          </button>
          <button
            type="button"
            className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] border border-border bg-mc-elev text-[11.5px] font-medium text-foreground hover:border-mc-border-strong"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6 pt-3.5">
        {d.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-mc-text-dim" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-mc-elev">
              <StatCell label="Distance" value={d.distanceKm != null ? d.distanceKm.toFixed(1) : '—'} unit="km" />
              <StatCell label="Duration" value={d.durationLabel} />
              <StatCell label="Idle" value={d.idle} unit="m" />
              <StatCell label="Avg speed" value={d.avgSpeed} unit="km/h" />
              <StatCell label="Top speed" value={d.topSpeed} unit="km/h" />
              <StatCell label="Speeding" value={d.speeding} unit="events" />
            </div>

            <div>
              <SectionHd title="Speed · last route" meta={`0–${d.topSpeed} km/h`} />
              <div className="h-[100px] rounded-lg border border-border bg-mc-elev px-3 py-2.5">
                <Sparkline data={d.speed} color="var(--mc-accent)" height={80} />
              </div>
            </div>

            <div>
              <SectionHd title="Stops" meta={d.shownLabel} />
              <div className="flex flex-col overflow-hidden rounded-lg border border-border">
                {d.stops.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-mc-text-dim">
                    No planned stops for this route.
                  </div>
                )}
                {d.stops.map((s) => (
                  <div
                    key={s.num}
                    className="grid grid-cols-[22px_1fr_auto] items-center gap-2.5 border-b border-border px-3 py-[9px] text-xs last:border-b-0"
                  >
                    <div
                      className={cn(
                        'grid h-[22px] w-[22px] place-items-center rounded-full font-mono text-[10px] font-bold',
                        stopTone(s.state),
                      )}
                    >
                      {s.num}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{s.name}</div>
                      <div className="truncate font-mono text-[10.5px] text-mc-text-muted">
                        {s.sub} · {s.durLabel}
                      </div>
                    </div>
                    <div className="text-right font-mono text-[11px]">
                      <div className="font-semibold text-foreground">{s.actual}</div>
                      <div
                        className={cn(
                          'mt-px block text-[9.5px] text-mc-text-dim',
                          s.state === 'late' &&
                            'text-[oklch(0.55_0.14_80)] dark:text-[oklch(0.85_0.16_80)]',
                        )}
                      >
                        {s.delta}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
