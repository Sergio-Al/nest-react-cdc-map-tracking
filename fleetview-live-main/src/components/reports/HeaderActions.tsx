import { useState } from 'react';
import { Share2, CalendarClock, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useReportsStore } from '@/stores/reports.store';

const SECONDARY =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-mc-elev px-2.5 text-xs font-medium text-foreground transition-colors hover:border-mc-border-strong';

export function ShareButton() {
  const { tab, from, to } = useReportsStore();
  const { t } = useTranslation('reports');

  const onShare = async () => {
    const url = `${window.location.origin}/reports?tab=${tab}&from=${from}&to=${to}`;
    const copy = async () => {
      await navigator.clipboard.writeText(url);
      toast.success(t('share.copied'));
    };
    try {
      if (navigator.share) {
        await navigator.share({ title: t('share.title'), url });
      } else {
        await copy();
      }
    } catch (err) {
      // User dismissed the native share sheet — not an error.
      if (err instanceof Error && err.name === 'AbortError') return;
      try {
        await copy();
      } catch {
        toast.error(t('share.failed'));
      }
    }
  };

  return (
    <button type="button" onClick={onShare} className={SECONDARY}>
      <Share2 className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{t('actions.share')}</span>
    </button>
  );
}

type Frequency = 'daily' | 'weekly' | 'monthly';

interface SavedSchedule {
  id: string;
  tab: string;
  from: string;
  to: string;
  frequency: Frequency;
  email: string;
  createdAt: string;
}

const STORAGE_KEY = 'reports:schedules';

function loadSchedules(): SavedSchedule[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function ScheduleButton() {
  const { tab, from, to } = useReportsStore();
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [email, setEmail] = useState('');
  const existing = open ? loadSchedules().length : 0;
  const { t } = useTranslation('reports');

  const submit = () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error(t('scheduleDialog.errors.invalidEmail'));
      return;
    }
    const entry: SavedSchedule = {
      id: crypto.randomUUID(),
      tab,
      from,
      to,
      frequency,
      email,
      createdAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...loadSchedules(), entry]));
    } catch {
      toast.error(t('scheduleDialog.errors.saveFailed'));
      return;
    }
    toast.success(
      t('scheduleDialog.success', {
        frequency: t(`scheduleDialog.${frequency}`),
        tab: t(`tabs.${tab}`),
        email,
      }),
    );
    setEmail('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={SECONDARY}>
          <CalendarClock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('actions.schedule')}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-3">
          <div>
            <div className="text-[13px] font-semibold text-foreground">{t('scheduleDialog.title')}</div>
            <div
              className="mt-0.5 text-[11px] text-mc-text-muted"
              dangerouslySetInnerHTML={{
                __html: t('scheduleDialog.subtitle', { tab: t(`tabs.${tab}`) }),
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-mc-text-muted">{t('scheduleDialog.frequency')}</label>
            <div className="inline-flex w-full rounded-md border border-border bg-mc-surface p-0.5">
              {(['daily', 'weekly', 'monthly'] as Frequency[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={cn(
                    'h-7 flex-1 rounded text-[11.5px] font-medium transition-colors',
                    frequency === f
                      ? 'bg-mc-elev text-foreground shadow-sm'
                      : 'text-mc-text-muted hover:text-foreground',
                  )}
                >
                  {t(`scheduleDialog.${f}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-mc-text-muted">{t('scheduleDialog.email')}</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={t('scheduleDialog.emailPlaceholder')}
              className="h-8 text-xs"
            />
          </div>

          {existing > 0 && (
            <div className="text-[10.5px] text-mc-text-dim">
              {t('scheduleDialog.savedCount', { count: existing })}
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-mc-accent text-xs font-medium text-mc-accent-fg hover:bg-mc-accent-strong"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {t('scheduleDialog.submit')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ExportButton() {
  const exporter = useReportsStore((s) => s.exporter);
  const { t } = useTranslation('reports');
  return (
    <button
      type="button"
      disabled={!exporter}
      onClick={() => exporter?.()}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md bg-mc-accent px-3 text-xs font-medium text-mc-accent-fg transition-colors hover:bg-mc-accent-strong',
        !exporter && 'cursor-not-allowed opacity-50 hover:bg-mc-accent',
      )}
    >
      <Download className="h-3.5 w-3.5" />
      {t('actions.export')}
    </button>
  );
}
