import type { EnrichedPosition } from "@/types/position.types";

export type DriverStatus = "moving" | "idle" | "offline";

const OFFLINE_AFTER_MIN = 5;
const MOVING_ABOVE_KMH = 4;

/** Status from a live position: stale (>5 min) = offline, fast = moving, else idle. */
export function getDriverStatus(position?: Pick<EnrichedPosition, "time" | "speed">): DriverStatus {
  if (!position) return "offline";
  const ageMin = (Date.now() - new Date(position.time).getTime()) / 60000;
  if (ageMin > OFFLINE_AFTER_MIN) return "offline";
  if (position.speed > MOVING_ABOVE_KMH) return "moving";
  return "idle";
}

/** Rounded speed for display. Positions arrive in km/h (the backend converts Traccar's knots). */
export function speedKmh(speed?: number): number {
  return Math.round(speed ?? 0);
}

/** Compact "45s ago" / "12m ago" / "2h ago" age label. */
export function formatAge(time?: string): string {
  if (!time) return "—";
  const s = Math.floor((Date.now() - new Date(time).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** CSS variable for a status hue (consumable in inline styles). */
export function statusColorVar(status: DriverStatus): string {
  return `var(--mc-status-${status})`;
}
