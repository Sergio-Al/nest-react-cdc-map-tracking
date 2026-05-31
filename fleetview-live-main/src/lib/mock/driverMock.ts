/**
 * MOCK DATA — placeholder for backend endpoints that don't exist yet
 * (e.g. GET /drivers/:id/current-route). Values are deterministic per driverId
 * so the UI is stable across renders. Replace with real hooks when the
 * endpoints land; see hooks/api/useDriverCurrentRoute.ts (Phase 5).
 */

import { getDriverStatus, speedKmh } from "@/lib/driverStatus";
import type { EnrichedPosition } from "@/types/position.types";

const ROUTE_NAMES = [
  "Zona Sur",
  "El Alto Norte",
  "Centro Histórico",
  "Miraflores",
  "Sopocachi",
  "Calacoto",
  "Achumani",
  "San Pedro",
];

/** Stable non-negative hash of a string id. */
export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export interface MockRouteSummary {
  routeName: string;
  progress: number;
  total: number;
}

export function getMockRouteSummary(driverId: string): MockRouteSummary {
  const h = hashId(driverId);
  const total = 6 + (h % 7); // 6..12 stops
  const progress = h % (total + 1); // 0..total completed
  return { routeName: ROUTE_NAMES[h % ROUTE_NAMES.length], progress, total };
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

/**
 * Fleet summary for the map mini-stats card. `activeMoving/Total` and `avgSpeedKmh`
 * are REAL (derived from live positions); `visitsToday`, `distanceKm`, and
 * `onTimePct` are MOCK (no backend aggregation yet) — deterministic for a stable demo.
 */
export function getFleetStats(drivers: DriverLike[]): FleetStats {
  const withPos = drivers.filter((d) => d.position);
  const activeMoving = drivers.filter((d) => getDriverStatus(d.position) === "moving").length;
  const avgSpeedKmh = withPos.length
    ? Math.round(withPos.reduce((s, d) => s + speedKmh(d.position!.speed), 0) / withPos.length)
    : 0;

  const visitsToday = drivers.reduce((s, d) => s + getMockRouteSummary(d.id).progress, 0);
  const distanceKm = withPos.reduce((s, d) => s + (hashId(d.id) % 60), 0);
  const onTimePct = drivers.length ? 88 + (hashId(drivers.map((d) => d.id).join("")) % 10) : 0;

  return { activeMoving, activeTotal: drivers.length, avgSpeedKmh, visitsToday, distanceKm, onTimePct };
}

const CUSTOMERS = [
  "Andes Foods",
  "Mercado Central",
  "Farmacia Bolívar",
  "Hotel Presidente",
  "Tienda La Paz",
  "Café Ketal",
  "Distribuidora Sur",
  "Almacén Norte",
];

// ── Activity feed (MOCK — replace with GET /drivers/:id/events) ──
export type EventTone = "accent" | "moving" | "idle" | "offline" | "empty";

export interface MockEvent {
  id: string;
  tone: EventTone;
  /** Muted action phrase, e.g. "Arrived at". */
  label: string;
  /** Highlighted subject (location / customer / value). */
  subject?: string;
  time: string;
}

export function getMockEvents(driverId: string, plate?: string | null): MockEvent[] {
  const h = hashId(driverId);
  const cust = (i: number) => CUSTOMERS[(h + i) % CUSTOMERS.length];
  const events: Omit<MockEvent, "id">[] = [
    { tone: "accent", label: "Arrived at", subject: cust(0), time: "2m ago" },
    { tone: "moving", label: "Departed", subject: `${cust(1)} · ${3 + (h % 8)} km`, time: "14m ago" },
    { tone: "moving", label: "Visit completed ·", subject: cust(1), time: "16m ago" },
    { tone: "idle", label: `Idle for ${4 + (h % 6)} min ·`, subject: "traffic on Av. 6 de Agosto", time: "32m ago" },
    { tone: "moving", label: "Arrived at", subject: cust(2), time: "48m ago" },
    { tone: "idle", label: "Speeding ·", subject: `${62 + (h % 15)} km/h on Autopista`, time: "1h ago" },
    { tone: "empty", label: "Shift started · vehicle", subject: plate ?? "—", time: "3h ago" },
  ];
  return events.map((e, i) => ({ ...e, id: `${driverId}-ev-${i}` }));
}

// ── Route stops (MOCK — replace with GET /drivers/:id/current-route) ──
export type StopState = "done" | "current" | "pending";

export interface MockStop {
  name: string;
  detail: string;
  state: StopState;
  time: string;
}

export function getMockStops(driverId: string): MockStop[] {
  const { total, progress } = getMockRouteSummary(driverId);
  const h = hashId(driverId);
  return Array.from({ length: total }, (_, i) => {
    const mins = i * 40 + (h % 20);
    const t = `${String(8 + Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    const state: StopState = i < progress ? "done" : i === progress ? "current" : "pending";
    return {
      name: CUSTOMERS[(h + i) % CUSTOMERS.length],
      detail: `Pedido #${1000 + ((h + i * 37) % 9000)}`,
      state,
      time: state === "done" ? t : `ETA ${t}`,
    };
  });
}

// ── Speed sparkline (MOCK — last ~40 readings, km/h) ──
export function getMockSpeedHistory(driverId: string, points = 40): number[] {
  const h = hashId(driverId);
  return Array.from({ length: points }, (_, i) =>
    Math.max(0, Math.round(22 + 16 * Math.sin((i + h) / 4) + ((h >> (i % 5)) & 7))),
  );
}

// ── Vehicle info (MOCK — replace with vehicle entity join) ──
const MAKES: [string, string][] = [
  ["Toyota", "Hilux"],
  ["Nissan", "Frontier"],
  ["Ford", "Ranger"],
  ["Volkswagen", "Amarok"],
  ["Chevrolet", "D-Max"],
];

export interface MockVehicle {
  make: string;
  model: string;
  year: number;
  fuelPct: number;
  odometerKm: number;
  lastService: string;
}

export function getMockVehicleInfo(driverId: string): MockVehicle {
  const h = hashId(driverId);
  const [make, model] = MAKES[h % MAKES.length];
  return {
    make,
    model,
    year: 2018 + (h % 7),
    fuelPct: 35 + (h % 60),
    odometerKm: 40000 + (h % 120) * 1000,
    lastService: `${2024 + (h % 2)}-${String(1 + (h % 12)).padStart(2, "0")}-15`,
  };
}
