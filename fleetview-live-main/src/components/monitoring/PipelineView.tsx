import { Fragment, useEffect, useState } from 'react';
import { ArrowRight, Pin, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { usePipelineTraces, useDlqTopics, useDlqMessages, useReplayDlq } from '@/hooks/api/usePipeline';
import { selectTrace } from './pipeline-state';
import { cn } from '@/lib/utils';
import { translateApiError } from '@/lib/apiError';
import type { PipelineTrace, PipelineStage } from '@/types/pipeline.types';

const NODES: { id: string; stages: PipelineStage[] }[] = [
  { id: 'api', stages: ['api.received'] },
  { id: 'kafka', stages: ['kafka.produced'] },
  { id: 'integration', stages: ['integration.consumed', 'integration.retry', 'dlq.replayed'] },
  { id: 'mysql', stages: ['mysql.committed'] },
  { id: 'debezium', stages: ['cdc.captured'] },
  { id: 'pg', stages: ['pg.applied'] },
  { id: 'ws', stages: ['ws.broadcast'] },
];
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-mc-border bg-mc-elev px-3 py-2 text-sm font-medium hover:bg-mc-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-mc-accent disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]';

function Architecture({ trace }: { trace?: PipelineTrace }) {
  const { t } = useTranslation('monitoring');
  const last = trace?.stages.at(-1)?.stage;
  const standalone = trace?.mode === 'standalone';
  const path = standalone ? NODES.filter((node) => ['api', 'pg', 'ws'].includes(node.id)) : NODES;
  return (
    <section className="rounded-xl border border-mc-border bg-mc-elev p-5" aria-label={t('pipeline.architecture')}>
      <h2 className="text-lg font-semibold">{t('pipeline.architecture')}</h2>
      <p className="mt-1 text-sm text-mc-text-muted">{t(trace?.mode === 'standalone' ? 'pipeline.shortPath' : 'pipeline.fullPath')}</p>
      <div className="mt-5 flex items-center overflow-x-auto pb-2">
        {path.map((node, index) => {
          const reached = trace?.stages.some((stage) => node.stages.includes(stage.stage));
          const current = trace?.status === 'in_flight' && last && node.stages.includes(last);
          return (
            <Fragment key={node.id}>
              {index > 0 && <ArrowRight aria-hidden className="mx-2 h-5 w-5 shrink-0 text-mc-text-dim" />}
              <div className={cn('min-w-[110px] flex-1 rounded-lg border px-3 py-4 text-center', reached ? 'border-mc-accent-border bg-mc-accent-soft text-mc-accent' : 'border-mc-border bg-mc-surface text-mc-text-muted', current && 'motion-safe:animate-pulse ring-2 ring-mc-accent')}>
                <div className="text-base font-semibold">{t(`pipeline.nodes.${node.id}`)}</div>
                <div className="mt-1 text-xs">{t(current ? 'pipeline.current' : reached ? 'pipeline.reached' : 'pipeline.waiting')}</div>
              </div>
            </Fragment>
          );
        })}
      </div>
      {standalone && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-mc-text-muted">
          <span>{t('pipeline.skipped')}:</span>
          {NODES.filter((node) => !['api', 'pg', 'ws'].includes(node.id)).map((node) => (
            <span key={node.id} className="rounded-lg border border-dashed border-mc-border px-3 py-2 opacity-50">{t(`pipeline.nodes.${node.id}`)}</span>
          ))}
        </div>
      )}
      {trace?.stages.some((stage) => stage.stage === 'dlq.sent') && (
        <div className={cn('mt-4 rounded-lg border px-4 py-3 text-base font-semibold', trace.status === 'failed' ? 'border-mc-error-border bg-mc-error-soft text-mc-error' : 'border-mc-border text-mc-text-muted')}>
          {t(trace.status === 'failed' ? 'pipeline.dlqBranch' : 'pipeline.replayedBranch')}
        </div>
      )}
    </section>
  );
}

function Timeline({ trace }: { trace: PipelineTrace }) {
  const { t, i18n } = useTranslation('monitoring');
  return (
    <section className="min-w-0 rounded-xl border border-mc-border bg-mc-elev p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('pipeline.timeline')}</h2>
        <span className="font-mono text-xl font-semibold text-mc-accent">{t('pipeline.total', { value: trace.totalMs ?? '—' })}</span>
      </div>
      <p className="mt-2 break-all font-mono text-xs text-mc-text-muted">{trace.correlationId}</p>
      <ol className="mt-5 space-y-3">
        {trace.stages.map((stage, index) => {
          const delta = index === 0 ? 0 : Date.parse(stage.at) - Date.parse(trace.stages[index - 1].at);
          return (
            <li key={`${stage.stage}-${index}`} className={cn('rounded-lg border border-mc-border p-3', stage.stage === 'dlq.sent' && 'border-mc-error-border bg-mc-error-soft')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-base font-medium">{t(`pipeline.stages.${stage.stage}`)}</span>
                <span className="font-mono text-base text-mc-accent">{t('pipeline.delta', { value: delta })}</span>
              </div>
              <time dateTime={stage.at} className="mt-1 block font-mono text-sm text-mc-text-muted">{new Date(stage.at).toLocaleString(i18n.language)}</time>
              {stage.detail && Object.entries(stage.detail).map(([key, value]) => (
                <div key={key} className="mt-1 break-words text-sm text-mc-text-muted">
                  <span className="font-medium">{t(`pipeline.details.${key}`, { defaultValue: key })}: </span>
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DlqPanel() {
  const { t } = useTranslation('monitoring');
  const [topic, setTopic] = useState<string | null>(null);
  const topics = useDlqTopics();
  const messages = useDlqMessages(topic);
  const replay = useReplayDlq();
  const replayTopic = async (name: string) => {
    try {
      const result = await replay.mutateAsync(name);
      const message = t('pipeline.dlq.result', result);
      if (result.errors > 0) toast.error(message);
      else toast.success(message);
    } catch (error) {
      toast.error(translateApiError(error, t('pipeline.dlq.replayError')));
    }
  };
  return (
    <section className="rounded-xl border border-mc-border bg-mc-elev p-5">
      <h2 className="text-lg font-semibold">{t('pipeline.dlq.title')}</h2>
      <p className="mt-1 text-sm text-mc-text-muted">{t('pipeline.dlq.note')}</p>
      {topics.isLoading && <p className="mt-3">{t('pipeline.loading')}</p>}
      {topics.isError && <p className="mt-3 text-mc-error">{t('pipeline.dlq.loadError')}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {topics.data?.topics.map((item) => (
          <div key={item.topic} className="rounded-lg border border-mc-border bg-mc-surface p-3">
            <div className="break-all font-mono text-sm font-semibold">{item.topic}</div>
            <p className="mt-2 text-base">{t('pipeline.dlq.pending', { count: item.pendingCount })}</p>
            <p className="mb-2 text-sm text-mc-text-muted">{t('pipeline.dlq.count', { count: item.messageCount })}</p>
            <div className="flex gap-2">
              <button type="button" className={buttonClass} onClick={() => { setTopic(item.topic); if (topic === item.topic) messages.refetch(); }} aria-pressed={topic === item.topic}>{t('pipeline.dlq.peek')}</button>
              <button type="button" className={buttonClass} disabled={replay.isPending || item.pendingCount === 0} onClick={() => replayTopic(item.topic)}>{t('pipeline.dlq.replay')}</button>
            </div>
          </div>
        ))}
      </div>
      {topic && (
        <div className="mt-5">
          <h3 className="break-all font-mono text-base font-semibold">{topic}</h3>
          {messages.isFetching && <p className="mt-2">{t('pipeline.loading')}</p>}
          {messages.isError && <p className="mt-2 text-mc-error">{t('pipeline.dlq.loadError')}</p>}
          {messages.data?.messages.length === 0 && <p className="mt-2 text-mc-text-muted">{t('pipeline.dlq.empty')}</p>}
          {messages.data?.messages.map((message) => (
            <article key={`${message.partition}-${message.offset}`} className={`mt-3 rounded-lg border p-4 ${message.replayed ? 'border-mc-border bg-mc-surface opacity-70' : 'border-mc-error-border bg-mc-error-soft'}`}>
              <p className="text-sm font-semibold">
                {t('pipeline.dlq.message', { partition: message.partition, offset: message.offset })}
                {' · '}
                {t(message.replayed ? 'pipeline.dlq.replayedBadge' : 'pipeline.dlq.pendingBadge')}
              </p>
              {Object.entries(message.headers).map(([key, value]) => <p key={key} className="mt-1 break-all text-sm"><span className="font-mono font-semibold">{key}: </span>{value}</p>)}
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-mc-surface p-3 text-sm">{message.value}</pre>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function PipelineView() {
  const { t, i18n } = useTranslation('monitoring');
  const user = useAuthStore((state) => state.user);
  const traces = usePipelineTraces();
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const selected = selectTrace(traces.data ?? [], pinnedId);
  const relativeTime = (at: string) => {
    const seconds = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
    return new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' }).format(-Math.floor(seconds < 60 ? seconds : seconds < 3600 ? seconds / 60 : seconds / 3600), seconds < 60 ? 'second' : seconds < 3600 ? 'minute' : 'hour');
  };
  return (
    <div className="space-y-5 p-4 text-mc-text sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{t('pipeline.title')}</h1><p className="mt-1 text-base text-mc-text-muted">{t('pipeline.subtitle')}</p></div>
        <button type="button" className={buttonClass} onClick={() => traces.refetch()}><RefreshCw className={cn('h-4 w-4', traces.isFetching && 'motion-safe:animate-spin')} />{t('page.refresh')}</button>
      </div>
      <p className={cn('text-sm font-medium', traces.isConnected ? 'text-mc-accent' : 'text-mc-text-muted')}>{t(traces.isConnected ? 'pipeline.live' : 'pipeline.reconnecting')}</p>
      {traces.isError && <p role="alert" className="rounded-lg border border-mc-error-border bg-mc-error-soft p-4 text-mc-error">{t('pipeline.loadError')}</p>}
      <Architecture trace={selected} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <section className="rounded-xl border border-mc-border bg-mc-elev p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{t('pipeline.recent')}</h2><button type="button" className={buttonClass} onClick={() => setPinnedId(null)} aria-pressed={!pinnedId}>{t(pinnedId ? 'pipeline.resume' : 'pipeline.following')}</button></div>
          <p className="mt-2 text-sm text-mc-text-muted">{t('pipeline.pinHint')}</p>
          {traces.isLoading && <p className="mt-4">{t('pipeline.loading')}</p>}
          {!traces.isLoading && !traces.data?.length && <p className="mt-4 text-mc-text-muted">{t('pipeline.empty')}</p>}
          <div className="mt-4 max-h-[640px] space-y-2 overflow-y-auto">
            {traces.data?.map((trace) => (
              <button type="button" key={trace.correlationId} onClick={() => setPinnedId(trace.correlationId)} aria-pressed={selected?.correlationId === trace.correlationId} className={cn('w-full rounded-lg border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-mc-accent', selected?.correlationId === trace.correlationId ? 'border-mc-accent-border bg-mc-accent-soft' : 'border-mc-border hover:bg-mc-surface')}>
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-base font-semibold">{t(`pipeline.entities.${trace.entity}`)} · {t(`pipeline.ops.${trace.op}`)}</span>{pinnedId === trace.correlationId && <Pin className="h-4 w-4" aria-label={t('pipeline.pinned')} />}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span className="rounded border border-mc-border px-2 py-0.5">{t(`pipeline.modes.${trace.mode}`)}</span><span className={cn('font-semibold', trace.status === 'failed' ? 'text-mc-error' : 'text-mc-accent')}>{t(`pipeline.status.${trace.status}`)}</span><span className="font-mono">{t('pipeline.duration', { value: trace.totalMs ?? '—' })}</span></div>
                <div className="mt-2 flex justify-between gap-2 text-xs text-mc-text-muted"><span className="truncate font-mono">{trace.correlationId}</span><time className="shrink-0" dateTime={trace.startedAt}>{relativeTime(trace.startedAt)}</time></div>
              </button>
            ))}
          </div>
        </section>
        {selected ? <Timeline trace={selected} /> : <p className="p-5 text-mc-text-muted">{t('pipeline.select')}</p>}
      </div>
      {user?.role === 'admin' && <DlqPanel />}
    </div>
  );
}
