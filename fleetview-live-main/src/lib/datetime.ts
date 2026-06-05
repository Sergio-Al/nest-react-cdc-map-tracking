/**
 * Timezone-aware date helpers for report ranges.
 *
 * The dashboard lets the user pick a *civil* day range ("June 1–14") in their
 * configured timezone. Storage and the instant-based history queries work in
 * UTC. These helpers bridge the two without a heavyweight dependency, using the
 * Intl offset trick (DST-correct because the offset is computed at the actual
 * wall-clock instant).
 */
import { useAuthStore } from '@/stores/auth.store';

export const SYSTEM_TZ = 'America/La_Paz';

export type DatePreset =
  | 'today' | 'yesterday' | '7d' | '14d' | '30d' | 'mtd' | 'qtd' | 'ytd' | 'custom';

/** Offset (ms) to add to UTC to get local time in `tz` at instant `date`. */
function tzOffsetMs(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const asUTC = Date.UTC(
    +p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second,
  );
  return asUTC - date.getTime();
}

/** UTC instant for a wall-clock time interpreted in `tz`. */
function zonedWallToUtc(
  y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string,
): Date {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  let utc = guess - tzOffsetMs(tz, new Date(guess));
  // Refine once for DST transition days (offset at the guessed instant may differ).
  const refined = guess - tzOffsetMs(tz, new Date(utc));
  if (refined !== utc) utc = refined;
  return new Date(utc);
}

/** The civil Y/M/D of "now" in `tz`. */
function todayInTz(tz: string): { y: number; m: number; d: number } {
  // en-CA renders as yyyy-mm-dd.
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * Resolve a preset to a `[from, to]` pair of `yyyy-mm-dd` **civil dates in `tz`**.
 * Calendar math runs on a UTC cursor purely to avoid the browser-local
 * `toISOString` skew — the dates are tz civil days, not instants.
 */
export function presetRange(preset: DatePreset, tz: string = SYSTEM_TZ): { from: string; to: string } {
  const { y, m, d } = todayInTz(tz);
  const end = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(Date.UTC(y, m - 1, d));
  switch (preset) {
    case 'today': break;
    case 'yesterday':
      start.setUTCDate(start.getUTCDate() - 1);
      end.setUTCDate(end.getUTCDate() - 1);
      break;
    case '7d':  start.setUTCDate(start.getUTCDate() - 6); break;
    case '14d': start.setUTCDate(start.getUTCDate() - 13); break;
    case '30d': start.setUTCDate(start.getUTCDate() - 29); break;
    case 'mtd': start.setUTCDate(1); break;
    case 'qtd': start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3, 1); break;
    case 'ytd': start.setUTCMonth(0, 1); break;
  }
  return { from: ymd(start), to: ymd(end) };
}

/**
 * Convert a civil `[from, to]` day range (in `tz`) to inclusive UTC ISO
 * instants: start of the `from` day … last millisecond of the `to` day.
 */
export function civilRangeToUtc(
  from: string, to: string, tz: string = SYSTEM_TZ,
): { fromIso: string; toIso: string } {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const fromUtc = zonedWallToUtc(fy, fm - 1, fd, 0, 0, 0, tz);
  // Start of the day AFTER `to`, minus 1ms → inclusive end of the `to` day.
  const toExclusive = zonedWallToUtc(ty, tm - 1, td + 1, 0, 0, 0, tz);
  return {
    fromIso: fromUtc.toISOString(),
    toIso: new Date(toExclusive.getTime() - 1).toISOString(),
  };
}

/** Non-hook accessor — the current user's timezone (system default if unset). */
export function getUserTimezone(): string {
  return useAuthStore.getState().settings?.timezone || SYSTEM_TZ;
}

/** Reactive timezone for use inside components/hooks (re-renders on change). */
export function useUserTz(): string {
  return useAuthStore((s) => s.settings?.timezone || SYSTEM_TZ);
}
