/** Stable non-negative hash for the remaining demo fleet KPI values. */
import { getDriverStatus, speedKmh } from '@/lib/driverStatus';
import type { EnrichedPosition } from '@/types/position.types';

export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

type DriverLike = { id: string; position?: EnrichedPosition };

export interface FleetStats {
  activeMoving: number;
  activeTotal: number;
  avgSpeedKmh: number;
  /** MOCK */ visitsToday: number;
  /** MOCK */ distanceKm: number;
  /** MOCK */ onTimePct: number;
}

/** Map mini-stats retain deterministic demo KPIs until fleet aggregation exists. */
export function getFleetStats(drivers: DriverLike[]): FleetStats {
  const withPos = drivers.filter((d) => d.position);
  const activeMoving = drivers.filter((d) => getDriverStatus(d.position) === 'moving').length;
  const avgSpeedKmh = withPos.length
    ? Math.round(withPos.reduce((s, d) => s + speedKmh(d.position!.speed), 0) / withPos.length)
    : 0;
  const visitsToday = drivers.reduce((s, d) => {
    const h = hashId(d.id);
    return s + h % (7 + h % 7);
  }, 0);
  const distanceKm = withPos.reduce((s, d) => s + (hashId(d.id) % 60), 0);
  const onTimePct = drivers.length ? 88 + (hashId(drivers.map((d) => d.id).join('')) % 10) : 0;
  return { activeMoving, activeTotal: drivers.length, avgSpeedKmh, visitsToday, distanceKm, onTimePct };
}
