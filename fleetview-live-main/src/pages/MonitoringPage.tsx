import { Fragment } from 'react';
import { useCdcLag } from '@/hooks/useCdcLag';
import { useTranslation } from 'react-i18next';
import { Activity, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CdcLagSnapshot, TableMetrics, OffsetLag } from '@/types/monitoring.types';

// ── status / color helpers ─────────────────────────────────
const LAG = {
  ok: 'oklch(0.82 0.15 150)',
  warn: 'oklch(0.85 0.13 80)',
  bad: 'oklch(0.78 0.17 25)',
};

type SyncStatus = 'ok' | 'warn' | 'idle';

function tableStatus(m: TableMetrics): SyncStatus {
  if (m.eventsProcessed === 0 || m.lastEndToEndLagMs === null) return 'idle';
  return m.lastEndToEndLagMs < 1000 ? 'ok' : 'warn';
}

/** End-to-end lag split into value + unit, with its tone. */
function fmtLag(ms: number | null): { val: string; unit: string; color: string } {
  if (ms === null) return { val: '—', unit: '', color: 'var(--mc-text-dim)' };
  if (ms < 1000) return { val: String(ms), unit: 'ms', color: LAG.ok };
  const s = (ms / 1000).toFixed(1);
  return { val: s, unit: 's', color: ms < 5000 ? LAG.warn : LAG.bad };
}

function offsetLagColor(lag: number): string {
  if (lag === 0) return 'var(--mc-text-dim)';
  if (lag <= 10) return LAG.ok;
  if (lag <= 50) return LAG.warn;
  return LAG.bad;
}

// ── atoms ───────────────────────────────────────────────────
function Pill({ status, children }: { status: SyncStatus; children: React.ReactNode }) {
  const styles: Record<SyncStatus, { bg: string; border: string; color: string; dot: string }> = {
    ok: {
      bg: 'oklch(0.72 0.16 150 / 0.13)', border: 'oklch(0.72 0.16 150 / 0.3)',
      color: 'oklch(0.82 0.15 150)', dot: 'var(--mc-status-moving)',
    },
    warn: {
      bg: 'oklch(0.78 0.14 80 / 0.14)', border: 'oklch(0.78 0.14 80 / 0.32)',
      color: 'oklch(0.85 0.13 80)', dot: 'var(--mc-status-idle)',
    },
    idle: {
      bg: 'var(--mc-surface)', border: 'var(--mc-border)',
      color: 'var(--mc-text-muted)', dot: 'var(--mc-text-dim)',
    },
  };
  const s = styles[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-[1.5]"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {children}
    </span>
  );
}

function HeadBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-7 items-center justify-center gap-1.5 rounded-[7px] border border-mc-border bg-background px-[11px] text-xs font-medium text-mc-text transition-colors hover:bg-mc-surface [&_svg]:h-[13px] [&_svg]:w-[13px]"
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-mc-border bg-mc-elev px-[5px] py-px font-mono text-[10.5px] tracking-[0.02em] text-mc-text-muted">
      {children}
    </kbd>
  );
}

export default function MonitoringPage() {
  const { data: snapshot, isLoading, error, isFetching, refetch } = useCdcLag();
  const { t, i18n } = useTranslation('monitoring');
  const nf = (n: number) => n.toLocaleString(i18n.language);

  const relTime = (ts: number | null): string => {
    if (!ts) return t('lagCard.never');
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return t('lagCard.secondsAgo', { count: s });
    if (s < 3600) return t('lagCard.minutesAgo', { count: Math.floor(s / 60) });
    return t('lagCard.hoursAgo', { count: Math.floor(s / 3600) });
  };
  const opLabel = (op: string | null): string =>
    op ? t(`lagCard.ops.${op}`, { defaultValue: op.toUpperCase() }) : t('lagCard.na');
  const statusLabel = (s: SyncStatus) => t(`status.${s}`);

  return (
    <div className="flex h-full flex-col">
      {/* workspace head */}
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-mc-border bg-background px-4">
        <nav className="flex items-center gap-[7px] whitespace-nowrap text-[13px]">
          <span className="text-mc-text-muted">{t('crumb.workspace')}</span>
          <span className="text-mc-text-dim">/</span>
          <span className="font-medium text-mc-text">{t('page.title')}</span>
          <span className="ml-0.5 font-mono text-[11.5px] text-mc-text-muted">· {t('crumb.scope')}</span>
        </nav>
        <div className="flex-1" />
        <HeadBtn onClick={() => refetch()}>
          <RefreshCw className={cn(isFetching && 'animate-spin')} /> {t('page.refresh')}
        </HeadBtn>
        <HeadBtn>
          <SlidersHorizontal /> {t('page.filters')}
        </HeadBtn>
      </header>

      {/* content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-8 pb-10 pt-[26px]">
          {/* page head */}
          <div className="mb-[22px] flex items-start gap-3.5">
            <div className="mt-px grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-mc-accent-border bg-mc-accent-soft text-mc-accent">
              <Activity className="h-[18px] w-[18px]" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.02em]">{t('page.title')}</h1>
              <p className="mt-1 text-[13px] text-mc-text-muted">{t('page.subtitle')}</p>
            </div>
            <div className="flex-1" />
            <div className="flex flex-col items-end gap-px whitespace-nowrap">
              <span className="text-[10px] uppercase tracking-[0.07em] text-mc-text-dim">{t('page.lastUpdated')}</span>
              <span className="flex items-center gap-[7px] font-mono text-[13px] text-mc-text-muted">
                <span className="h-1.5 w-1.5 animate-livepulse rounded-full bg-status-moving shadow-[0_0_0_3px_oklch(0.72_0.16_150_/_0.2)]" />
                {snapshot ? new Date(snapshot.timestamp).toLocaleTimeString(i18n.language) : '—'}
              </span>
            </div>
          </div>

          {isLoading && <LoadingState />}
          {error && (
            <p className="rounded-[10px] border border-mc-error-border bg-mc-error-soft px-4 py-3 text-[13px] text-mc-error">
              {t('page.errorBody', { message: error instanceof Error ? error.message : t('page.unknownError') })}
            </p>
          )}
          {!isLoading && !error && !snapshot && (
            <p className="text-[13px] text-mc-text-muted">{t('page.noDataBody')}</p>
          )}

          {snapshot && (
            <>
              {/* Table synchronization */}
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-mc-text-muted">
                {t('page.tableSync')}
              </p>
              <div className="mb-[30px] grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                {snapshot.tables.map((m) => {
                  const status = tableStatus(m);
                  const lag = fmtLag(m.lastEndToEndLagMs);
                  return (
                    <div key={m.table} className="flex flex-col gap-3 rounded-[10px] border border-mc-border bg-mc-elev p-[15px_16px]">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[13.5px] font-semibold">{m.table}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-mc-text-dim">{m.topic}</div>
                        </div>
                        <Pill status={status}>{statusLabel(status)}</Pill>
                      </div>
                      <div>
                        <div className="mb-[3px] text-[10px] uppercase tracking-[0.07em] text-mc-text-dim">{t('lagCard.endToEndLag')}</div>
                        <div className="font-mono text-[26px] font-semibold leading-none tracking-[-0.02em]" style={{ color: lag.color }}>
                          {lag.val}{lag.unit && <span className="ml-[3px] text-[13px] font-normal text-mc-text-dim">{lag.unit}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-[7px] border-t border-mc-border pt-3">
                        <KvRow k={t('lagCard.eventsProcessed')}><span className="font-mono text-mc-text">{nf(m.eventsProcessed)}</span></KvRow>
                        <KvRow k={t('lagCard.lastOperation')}>
                          {m.lastOp
                            ? <span className="inline-flex items-center rounded-full border border-mc-border bg-mc-surface px-2 py-0.5 font-mono text-[11px] font-medium text-mc-text-muted">{opLabel(m.lastOp)}</span>
                            : <span className="text-mc-text-dim">{t('lagCard.na')}</span>}
                        </KvRow>
                        <KvRow k={t('lagCard.lastEvent')}>
                          <span className={cn('font-mono', status === 'idle' && !m.lastProcessedAt ? 'text-mc-text-dim' : 'text-mc-text')}>
                            {relTime(m.lastProcessedAt)}
                          </span>
                        </KvRow>
                      </div>
                      {status === 'idle' && m.eventsProcessed === 0 && (
                        <div className="pb-0.5 pt-1.5 text-center text-[11.5px] text-mc-text-dim">{t('card.noEventsSinceStart')}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Kafka offset lag */}
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-mc-text-muted">
                {t('offsetLag.title')}
              </p>
              <OffsetTable snapshot={snapshot} nf={nf} t={t} />
            </>
          )}
        </div>
      </div>

      {/* footer */}
      <footer className="flex h-[30px] shrink-0 items-center gap-3.5 border-t border-mc-border bg-background px-4 text-[11px] text-mc-text-dim">
        <span className="flex items-center gap-1.5"><Kbd>R</Kbd> {t('footer.refresh')}</span>
        <span className="h-3 w-px bg-mc-border" />
        <span className="flex items-center gap-1.5"><Kbd>⌘ K</Kbd> {t('footer.commands')}</span>
        <span className="h-3 w-px bg-mc-border" />
        <span className="flex items-center gap-1.5"><Kbd>⌘ /</Kbd> {t('footer.shortcuts')}</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10.5px] text-mc-text-muted">
          <span className="h-1.5 w-1.5 animate-livepulse rounded-full bg-status-moving" />
          {t('footer.streaming', { count: snapshot ? new Set(snapshot.kafkaOffsetLag.map((o) => o.topic)).size : 0 })}
        </span>
      </footer>
    </div>
  );
}

function KvRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="whitespace-nowrap text-mc-text-muted">{k}</span>
      <span className="text-[12px]">{children}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[200px] animate-pulse rounded-[10px] border border-mc-border bg-mc-elev" />
      ))}
    </div>
  );
}

// ── offset table (grouped by topic, with subtotals) ─────────
function OffsetTable({
  snapshot, nf, t,
}: {
  snapshot: CdcLagSnapshot;
  nf: (n: number) => string;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const groups = snapshot.kafkaOffsetLag.reduce<Record<string, OffsetLag[]>>((acc, o) => {
    (acc[o.topic] ??= []).push(o);
    return acc;
  }, {});
  const entries = Object.entries(groups);

  return (
    <div className="overflow-hidden rounded-[10px] border border-mc-border bg-mc-elev">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-mc-border bg-mc-surface px-[18px] py-[11px] text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-mc-text-dim">{t('offsetLag.topic')}</th>
            {['partition', 'latest', 'committed', 'lag'].map((h) => (
              <th key={h} className="border-b border-mc-border bg-mc-surface px-[18px] py-[11px] text-right text-[10.5px] font-semibold uppercase tracking-[0.06em] text-mc-text-dim">{t(`offsetLag.${h}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map(([topic, rows], gi) => {
            const total = rows.reduce((s, o) => s + o.lag, 0);
            return (
              <Fragment key={topic}>
                {rows.map((o, ri) => {
                  const groupStart = ri === 0 && gi > 0 ? 'border-t border-mc-border' : '';
                  return (
                    <tr key={`${topic}-${o.partition}`} className="group">
                      <td className={cn('border-b border-mc-border/50 px-[18px] py-[var(--mc-row-py)] text-left font-mono text-[12.5px] font-medium text-mc-text group-hover:bg-mc-surface/40', groupStart)}>
                        {ri === 0 ? topic : ''}
                      </td>
                      <td className={cn('border-b border-mc-border/50 px-[18px] py-[var(--mc-row-py)] text-right font-mono text-[12.5px] text-mc-text-muted group-hover:bg-mc-surface/40', groupStart)}>{o.partition}</td>
                      <td className={cn('border-b border-mc-border/50 px-[18px] py-[var(--mc-row-py)] text-right font-mono text-[12.5px] text-mc-text-muted group-hover:bg-mc-surface/40', groupStart)}>{nf(Number(o.latestOffset))}</td>
                      <td className={cn('border-b border-mc-border/50 px-[18px] py-[var(--mc-row-py)] text-right font-mono text-[12.5px] text-mc-text-muted group-hover:bg-mc-surface/40', groupStart)}>{nf(Number(o.committedOffset))}</td>
                      <td className={cn('border-b border-mc-border/50 px-[18px] py-[var(--mc-row-py)] text-right font-mono text-[12.5px] font-semibold group-hover:bg-mc-surface/40', groupStart)} style={{ color: offsetLagColor(o.lag) }}>{nf(o.lag)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={4} className="border-y border-mc-border bg-mc-surface px-[18px] py-[var(--mc-row-py)] text-left text-[12.5px] font-medium text-mc-text-muted">{t('offsetLag.totalFor', { topic })}</td>
                  <td className="border-y border-mc-border bg-mc-surface px-[18px] py-[var(--mc-row-py)] text-right font-mono text-[12.5px] font-semibold" style={{ color: offsetLagColor(total) }}>{nf(total)}</td>
                </tr>
              </Fragment>
            );
          })}
          {entries.length === 0 && (
            <tr><td colSpan={5} className="px-[18px] py-6 text-center text-[12.5px] text-mc-text-dim">{t('offsetLag.empty')}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
