/**
 * Driver activity feed — derived, not stored. Visit lifecycle timestamps give
 * arrived / completed / departed / skipped / failed; the position history gives
 * shift start, idle stretches and speeding. Pure functions so they're testable
 * without a database.
 */

export type DriverEventType =
  | 'shift_start'
  | 'arrived'
  | 'completed'
  | 'departed'
  | 'skipped'
  | 'failed'
  | 'idle'
  | 'speeding';

export interface DriverEvent {
  id: string;
  type: DriverEventType;
  time: string; // ISO
  customerName?: string;
  durationSec?: number; // idle: stopped for; completed: time on site
  speedKmh?: number; // speeding: peak speed
}

export interface VisitTimes {
  id: string;
  status: string;
  customerName: string | null;
  arrivedAt: Date | null;
  completedAt: Date | null;
  departedAt: Date | null;
}

export interface PositionSample {
  time: Date;
  speed: number; // km/h
}

/** Stopped for at least this long, away from a customer stop → idle. */
export const IDLE_MIN_SEC = 5 * 60;
/** At or below this speed the vehicle counts as stopped (GPS noise at rest). */
export const STOPPED_KMH = 3;
/** City speeding threshold, km/h. */
export const SPEEDING_KMH = 60;
/** Speeding must span at least this many consecutive fixes (filters GPS spikes). */
export const SPEEDING_MIN_FIXES = 2;
/** A gap longer than this means the device was off — it breaks idle/speeding runs. */
export const MAX_GAP_SEC = 10 * 60;
/** Stopping just before a stop's arrival is parking, not idling. */
const ARRIVAL_GRACE_SEC = 2 * 60;

const secs = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 1000;
const iso = (d: Date) => d.toISOString();

export function visitEvents(visits: VisitTimes[], from: Date, to: Date): DriverEvent[] {
  const inRange = (d: Date | null): d is Date => !!d && d >= from && d <= to;
  const events: DriverEvent[] = [];
  for (const v of visits) {
    const customerName = v.customerName ?? undefined;
    if (inRange(v.arrivedAt)) {
      events.push({ id: `${v.id}:arrived`, type: 'arrived', time: iso(v.arrivedAt), customerName });
    }
    if (inRange(v.completedAt)) {
      events.push({
        id: `${v.id}:completed`,
        type: 'completed',
        time: iso(v.completedAt),
        customerName,
        durationSec: v.arrivedAt ? Math.max(0, Math.round(secs(v.arrivedAt, v.completedAt))) : undefined,
      });
    }
    if (inRange(v.departedAt)) {
      // Skipped/failed are stamped via departed_at when the visit is closed out.
      const type = v.status === 'skipped' || v.status === 'failed' ? v.status : 'departed';
      events.push({ id: `${v.id}:${type}`, type, time: iso(v.departedAt), customerName });
    }
  }
  return events;
}

/** Windows where the driver was legitimately parked at a customer (until they leave, not until they complete). */
function onSiteWindows(visits: VisitTimes[], now: Date): [Date, Date][] {
  return visits
    .filter((v) => v.arrivedAt)
    .map((v) => [
      new Date(v.arrivedAt!.getTime() - ARRIVAL_GRACE_SEC * 1000),
      v.departedAt ?? now,
    ]);
}

export function positionEvents(
  positions: PositionSample[],
  visits: VisitTimes[],
  now: Date = new Date(),
): DriverEvent[] {
  if (positions.length === 0) return [];
  const events: DriverEvent[] = [
    { id: `shift:${iso(positions[0].time)}`, type: 'shift_start', time: iso(positions[0].time) },
  ];
  const onSite = onSiteWindows(visits, now);
  const atCustomer = (t: Date) => onSite.some(([a, b]) => t >= a && t <= b);

  let idleStart: PositionSample | null = null;
  let idleLast: PositionSample | null = null;
  let fast: PositionSample[] = [];

  const flushIdle = () => {
    if (idleStart && idleLast) {
      const duration = secs(idleStart.time, idleLast.time);
      if (duration >= IDLE_MIN_SEC && !atCustomer(idleStart.time)) {
        events.push({
          id: `idle:${iso(idleStart.time)}`,
          type: 'idle',
          time: iso(idleStart.time),
          durationSec: Math.round(duration),
        });
      }
    }
    idleStart = idleLast = null;
  };
  const flushFast = () => {
    if (fast.length >= SPEEDING_MIN_FIXES) {
      const peak = fast.reduce((m, p) => (p.speed > m.speed ? p : m));
      events.push({
        id: `speeding:${iso(fast[0].time)}`,
        type: 'speeding',
        time: iso(peak.time),
        speedKmh: Math.round(peak.speed),
      });
    }
    fast = [];
  };

  let prev: PositionSample | null = null;
  for (const p of positions) {
    if (prev && secs(prev.time, p.time) > MAX_GAP_SEC) {
      flushIdle();
      flushFast();
    }
    if (p.speed <= STOPPED_KMH) {
      idleStart ??= p;
      idleLast = p;
    } else {
      flushIdle();
    }
    if (p.speed > SPEEDING_KMH) fast.push(p);
    else flushFast();
    prev = p;
  }
  flushIdle();
  flushFast();
  return events;
}

/** Full feed, newest first. */
export function buildDriverEvents(
  visits: VisitTimes[],
  positions: PositionSample[],
  from: Date,
  to: Date,
  now: Date = new Date(),
): DriverEvent[] {
  return [...visitEvents(visits, from, to), ...positionEvents(positions, visits, now)].sort(
    (a, b) => b.time.localeCompare(a.time),
  );
}
