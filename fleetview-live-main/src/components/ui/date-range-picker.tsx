import { useState } from 'react';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function fmtRange(s: string): string {
  const d = parseYmd(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

interface DateRangePickerProps {
  /** Start date as `yyyy-MM-dd` (local timezone). */
  from: string;
  /** End date as `yyyy-MM-dd` (local timezone). */
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
  align?: 'start' | 'center' | 'end';
  numberOfMonths?: number;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  className,
  align = 'start',
  numberOfMonths = 2,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DateRange | undefined>();

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) setPending({ from: parseYmd(from), to: parseYmd(to) });
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-mc-elev px-2.5 font-mono text-xs text-foreground transition-colors hover:border-mc-border-strong',
            className,
          )}
        >
          <CalendarIcon className="h-3 w-3 text-mc-text-dim" />
          <span>{fmtRange(from)}</span>
          <span className="text-mc-text-dim">→</span>
          <span>{fmtRange(to)}</span>
          <ChevronDown className="ml-auto h-3 w-3 text-mc-text-dim" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0">
        <Calendar
          mode="range"
          numberOfMonths={numberOfMonths}
          defaultMonth={parseYmd(from)}
          selected={pending}
          onSelect={(range) => {
            setPending(range);
            if (range?.from && range?.to) {
              onChange(toYmd(range.from), toYmd(range.to));
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
