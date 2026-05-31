/**
 * Theme-aware status colour helpers for the Reports page.
 * Returns complete literal Tailwind class strings (so JIT picks them up) using
 * the handoff's OKLCH hues, with a `dark:` text variant for legibility in both
 * the light (teal default) and warm-dark themes. Solid fills reuse the shared
 * `--mc-status-*` vars (identical across themes).
 */

export type AvatarTone = 'green' | 'amber' | 'red';
export type BarTone = 'green' | 'amber' | 'red';

/** KPI / leaderboard delta chip. */
export function deltaChip(dir: 'up' | 'down' | 'flat'): string {
  if (dir === 'up')
    return 'bg-[oklch(0.72_0.16_150_/_0.15)] text-[oklch(0.45_0.16_150)] dark:text-[oklch(0.85_0.18_150)]';
  if (dir === 'down')
    return 'bg-[oklch(0.65_0.18_25_/_0.16)] text-[oklch(0.5_0.18_25)] dark:text-[oklch(0.78_0.18_25)]';
  return 'bg-mc-surface text-mc-text-muted';
}

/** Bare delta text (leaderboard rows). */
export function deltaText(dir: 'up' | 'down' | 'flat'): string {
  if (dir === 'up') return 'text-[oklch(0.55_0.16_150)] dark:text-[oklch(0.78_0.16_150)]';
  if (dir === 'down') return 'text-[oklch(0.55_0.18_25)] dark:text-[oklch(0.78_0.18_25)]';
  return 'text-mc-text-dim';
}

/** Round driver avatar (table / leaderboard / drill). */
export function avatarTone(tone: AvatarTone): string {
  switch (tone) {
    case 'green':
      return 'bg-[oklch(0.72_0.16_150_/_0.18)] text-[oklch(0.55_0.16_150)] dark:text-[oklch(0.85_0.18_150)]';
    case 'amber':
      return 'bg-[oklch(0.78_0.14_80_/_0.18)] text-[oklch(0.55_0.14_80)] dark:text-[oklch(0.85_0.16_80)]';
    case 'red':
      return 'bg-[oklch(0.65_0.18_25_/_0.18)] text-[oklch(0.55_0.18_25)] dark:text-[oklch(0.78_0.18_25)]';
  }
}

export type StatusKind =
  | 'completed'
  | 'late'
  | 'missed'
  | 'planned'
  | 'in_progress'
  | 'cancelled';

/** Status pill (text colour drives the leading dot via currentColor). */
export function statusPill(status: StatusKind): string {
  switch (status) {
    case 'completed':
      return 'bg-[oklch(0.72_0.16_150_/_0.16)] text-[oklch(0.45_0.16_150)] dark:text-[oklch(0.85_0.18_150)]';
    case 'late':
      return 'bg-[oklch(0.78_0.14_80_/_0.2)] text-[oklch(0.5_0.14_80)] dark:text-[oklch(0.85_0.16_80)]';
    case 'missed':
      return 'bg-[oklch(0.65_0.18_25_/_0.18)] text-[oklch(0.55_0.18_25)] dark:text-[oklch(0.78_0.18_25)]';
    case 'planned':
    case 'in_progress':
      return 'bg-[oklch(0.62_0.16_240_/_0.16)] text-[oklch(0.5_0.16_240)] dark:text-[oklch(0.78_0.16_240)]';
    case 'cancelled':
      return 'bg-mc-surface text-mc-text-muted';
  }
}

/** Solid CSS colour for mini-bar fills / drill-stop numbers. */
export function barColor(tone: BarTone): string {
  if (tone === 'green') return 'var(--mc-status-moving)';
  if (tone === 'amber') return 'var(--mc-status-idle)';
  return 'var(--mc-status-offline)';
}

/** Drill-stop number badge tone. */
export function stopTone(state: 'ok' | 'late' | 'miss'): string {
  if (state === 'ok')
    return 'bg-[oklch(0.72_0.16_150_/_0.18)] text-[oklch(0.45_0.16_150)] dark:text-[oklch(0.85_0.18_150)]';
  if (state === 'late')
    return 'bg-[oklch(0.78_0.14_80_/_0.2)] text-[oklch(0.5_0.14_80)] dark:text-[oklch(0.85_0.16_80)]';
  return 'bg-[oklch(0.65_0.18_25_/_0.18)] text-[oklch(0.5_0.18_25)] dark:text-[oklch(0.78_0.18_25)]';
}

/** Map an on-time % to a bar tone. */
export function toneForPct(pct: number): BarTone {
  return pct >= 90 ? 'green' : pct >= 80 ? 'amber' : 'red';
}
