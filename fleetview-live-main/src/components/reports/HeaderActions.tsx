import { useState } from 'react';
import { Share2, CalendarClock, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useReportsStore } from '@/stores/reports.store';

const SECONDARY =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-mc-elev px-2.5 text-xs font-medium text-foreground transition-colors hover:border-mc-border-strong';

export function ShareButton() {
  const { tab, from, to } = useReportsStore();

  const onShare = async () => {
    const url = `${window.location.origin}/reports?tab=${tab}&from=${from}&to=${to}`;
    const copy = async () => {
      await navigator.clipboard.writeText(url);
      toast.success('Share link copied to clipboard');
    };
    try {
      if (navigator.share) {
        await navigator.share({ title: 'FleetTrack · Reports', url });
      } else {
        await copy();
      }
    } catch (err) {
      // User dismissed the native share sheet — not an error.
      if (err instanceof Error && err.name === 'AbortError') return;
      try {
        await copy();
      } catch {
        toast.error('Could not share this view');
      }
    }
  };

  return (
    <button type="button" onClick={onShare} className={SECONDARY}>
      <Share2 className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Share</span>
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

  const submit = () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error('Enter a valid email address');
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
      toast.error('Could not save schedule');
      return;
    }
    toast.success(`Scheduled a ${frequency} ${tab} report to ${email}`);
    setEmail('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={SECONDARY}>
          <CalendarClock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Schedule</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-3">
          <div>
            <div className="text-[13px] font-semibold text-foreground">Schedule report</div>
            <div className="mt-0.5 text-[11px] text-mc-text-muted">
              Emailed as CSV for the <span className="font-medium capitalize">{tab}</span> view.
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-mc-text-muted">Frequency</label>
            <div className="inline-flex w-full rounded-md border border-border bg-mc-surface p-0.5">
              {(['daily', 'weekly', 'monthly'] as Frequency[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={cn(
                    'h-7 flex-1 rounded text-[11.5px] font-medium capitalize transition-colors',
                    frequency === f
                      ? 'bg-mc-elev text-foreground shadow-sm'
                      : 'text-mc-text-muted hover:text-foreground',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-mc-text-muted">Recipient email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="ops@fleet.bo"
              className="h-8 text-xs"
            />
          </div>

          {existing > 0 && (
            <div className="text-[10.5px] text-mc-text-dim">
              {existing} schedule{existing > 1 ? 's' : ''} saved on this device.
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-mc-accent text-xs font-medium text-mc-accent-fg hover:bg-mc-accent-strong"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Schedule report
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ExportButton() {
  const exporter = useReportsStore((s) => s.exporter);
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
      Export
    </button>
  );
}
