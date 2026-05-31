/**
 * MOCK DATA — history page
 *
 * speedColor, tripSummaryFrom, getMockSegments, getMockStops, getMockEvents,
 * getMockTimeComposition, getMockTrips, getMockRoutePath are all clearly
 * labeled mock/derived helpers.
 *
 * Real data flow:
 *   - useDriverHistory(driverId, from, to) → HistoryPosition[] from TimescaleDB
 *   - When that returns results, the page pushes them into usePlaybackStore via setPositions()
 *   - getMockRoutePath() is only used as a FALLBACK so the UI renders in demo mode
 *     when no backend history is available.
 *
 * Replace individual exports with real API hooks as endpoints become available.
 */

import type { HistoryPosition } from '@/types/history.types';

// ── Speed color buckets (exact OKLCH values from design) ────────────────────
export function speedColor(speedKmh: number): string {
  if (speedKmh < 5)  return 'oklch(0.6 0.005 250)';   // grey  — stopped/idle
  if (speedKmh < 20) return 'oklch(0.75 0.15 80)';    // amber — slow
  if (speedKmh < 40) return 'oklch(0.72 0.16 150)';   // lime  — normal
  if (speedKmh < 60) return 'oklch(0.6 0.14 245)';    // blue  — fast
  return 'oklch(0.62 0.2 25)';                          // red   — speeding
}

// ── Haversine distance between two lat/lng points (meters) ──────────────────
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLam = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Real-computed + mock-augmented trip summary ──────────────────────────────
export interface TripSummary {
  distanceKm: number;    // REAL — haversine sum
  durationMin: number;   // REAL — timestamp diff
  avgSpeedKmh: number;   // REAL — mean of positions[].speed
  topSpeedKmh: number;   // REAL — max of positions[].speed
  stops: number;         // MOCK — no stop-detection logic yet
  idleMin: number;       // MOCK
  avgSpeedDelta: number; // MOCK delta vs. previous trip
  idleDelta: number;     // MOCK
}

export function tripSummaryFrom(positions: HistoryPosition[]): TripSummary {
  if (positions.length === 0) {
    return {
      distanceKm: 0, durationMin: 0, avgSpeedKmh: 0,
      topSpeedKmh: 0, stops: 0, idleMin: 0,
      avgSpeedDelta: 0, idleDelta: 0,
    };
  }

  let distM = 0;
  let speedSum = 0;
  let topSpeed = 0;

  for (let i = 1; i < positions.length; i++) {
    const p = positions[i];
    const prev = positions[i - 1];
    distM += haversineM(prev.latitude, prev.longitude, p.latitude, p.longitude);
    speedSum += p.speed;
    if (p.speed > topSpeed) topSpeed = p.speed;
  }
  if (positions[0].speed > topSpeed) topSpeed = positions[0].speed;

  const first = new Date(positions[0].time).getTime();
  const last  = new Date(positions[positions.length - 1].time).getTime();
  const durationMin = Math.round((last - first) / 60000);
  const avgSpeed = positions.length > 1 ? Math.round(speedSum / (positions.length - 1)) : 0;

  return {
    distanceKm: Math.round((distM / 1000) * 10) / 10,
    durationMin,
    avgSpeedKmh: avgSpeed,
    topSpeedKmh: Math.round(topSpeed),
    // MOCK values — swap for real stop-detection when backend provides it
    stops: 8,
    idleMin: 14,
    avgSpeedDelta: 4,  // MOCK ▲4 vs previous day
    idleDelta: -2,     // MOCK ▼2 vs previous day
  };
}

// ── Mock segments (replace with GET /drivers/:id/segments) ──────────────────
export interface MockSegment {
  kind: 'move' | 'idle' | 'stop' | 'off';
  tag: string;
  name: string;
  time: string;
  dur: string;
  dist: string;
}

export function getMockSegments(_driverId: string): MockSegment[] {
  // MOCK — deterministic per any driverId for a stable demo
  return [
    { kind: 'move', tag: 'En route', name: 'Depot → Av. 6 de Agosto',        time: '07:30', dur: '44 min', dist: '6.2 km' },
    { kind: 'idle', tag: 'Idle',     name: 'Traffic · Av. 6 de Agosto',       time: '08:14', dur: '6 min',  dist: '—'     },
    { kind: 'move', tag: 'En route', name: 'Av. 6 de Agosto → Tienda La Paz', time: '08:20', dur: '54 min', dist: '8.4 km' },
    { kind: 'stop', tag: 'Stop',     name: 'Tienda La Paz · visit',           time: '09:14', dur: '22 min', dist: '—'     },
    { kind: 'move', tag: 'En route', name: 'Tienda La Paz → Distribuidora Sur',time: '09:36', dur: '1h 12m', dist: '14.8 km'},
    { kind: 'stop', tag: 'Stop',     name: 'Distribuidora Sur · visit',       time: '10:48', dur: '46 min', dist: '—'     },
    { kind: 'move', tag: 'En route', name: 'Distribuidora Sur → Calacoto',    time: '11:34', dur: '46 min', dist: '5.1 km' },
    { kind: 'idle', tag: 'Idle',     name: 'Awaiting customer · Calacoto',    time: '12:20', dur: '3 min',  dist: '—'     },
    { kind: 'stop', tag: 'Stop',     name: 'Café Ketal · visit',              time: '12:23', dur: '14 min', dist: '—'     },
    { kind: 'move', tag: 'En route', name: 'Calacoto → Sopocachi',            time: '12:37', dur: '1h 09m', dist: '3.5 km' },
  ];
}

// ── Mock stop list (replace with visit completions API) ─────────────────────
export interface MockHistStop {
  idx: number;
  label: string;
  kind: 'start' | 'stop' | 'end';
  name: string;
  lat: number;
  lng: number;
}

export function getMockHistStops(_driverId: string): MockHistStop[] {
  // MOCK — La Paz area coordinates
  return [
    { idx: 0, label: '07:30', kind: 'start', name: 'Depot · Achumani',          lat: -16.5421, lng: -68.0756 },
    { idx: 1, label: '09:14', kind: 'stop',  name: 'Tienda La Paz',             lat: -16.5289, lng: -68.0612 },
    { idx: 2, label: '10:48', kind: 'stop',  name: 'Distribuidora Sur',         lat: -16.5478, lng: -68.0498 },
    { idx: 3, label: '12:20', kind: 'stop',  name: 'Café Ketal · Calacoto',     lat: -16.5312, lng: -68.0843 },
    { idx: 4, label: '13:46', kind: 'end',   name: 'Currently here',            lat: -16.5198, lng: -68.0621 },
  ];
}

// ── Mock idle markers ────────────────────────────────────────────────────────
export interface MockIdleMarker {
  lat: number;
  lng: number;
  mins: number;
}

export function getMockIdleMarkers(_driverId: string): MockIdleMarker[] {
  // MOCK
  return [
    { lat: -16.535, lng: -68.072, mins: 6 },
    { lat: -16.531, lng: -68.084, mins: 3 },
  ];
}

// ── Mock time composition (replace with computed breakdown) ──────────────────
export interface TimeComposition {
  movingMin: number;
  stoppedMin: number;
  idleMin: number;
  offlineMin: number;
  totalMin: number;
}

export function getMockTimeComposition(): TimeComposition {
  // MOCK — static demo values; real implementation would compute from positions
  return { movingMin: 230, stoppedMin: 74, idleMin: 22, offlineMin: 46, totalMin: 372 };
}

// ── Mock trips list (replace with GET /drivers/:id/trips?window=7d) ─────────
export interface MockTrip {
  day: string;
  date: string;
  km: number;
  hrs: string;
  stops: number;
  segs: [number, number, number, number]; // move%, idle%, stop%, off%
  selected?: boolean;
}

export function getMockTrips(_driverId: string): MockTrip[] {
  // MOCK — replace with real trip history when endpoint is available
  return [
    { day: 'Mon', date: '25 May', km: 38.0, hrs: '6h 12m', stops: 8,  segs: [60, 10, 5, 25] },
    { day: 'Fri', date: '22 May', km: 56.4, hrs: '7h 48m', stops: 12, segs: [72, 6, 8, 14], selected: true },
    { day: 'Thu', date: '21 May', km: 44.1, hrs: '7h 02m', stops: 10, segs: [68, 8, 6, 18] },
    { day: 'Wed', date: '20 May', km: 51.7, hrs: '7h 31m', stops: 11, segs: [70, 5, 7, 18] },
    { day: 'Tue', date: '19 May', km: 32.9, hrs: '5h 14m', stops: 7,  segs: [62, 12, 4, 22] },
    { day: 'Mon', date: '18 May', km: 49.2, hrs: '7h 19m', stops: 10, segs: [69, 6, 7, 18] },
  ];
}

// ── Mock playback bar segments ───────────────────────────────────────────────
export interface PlaybackSeg {
  kind: 'move' | 'idle' | 'stop' | 'off';
  w: number; // percent width
}

export function getMockPlaybackSegs(): PlaybackSeg[] {
  // MOCK — replace with real segment breakdown computed from positions
  return [
    { kind: 'move', w: 14 },
    { kind: 'idle', w: 5  },
    { kind: 'move', w: 12 },
    { kind: 'stop', w: 6  },
    { kind: 'move', w: 16 },
    { kind: 'stop', w: 8  },
    { kind: 'move', w: 11 },
    { kind: 'idle', w: 4  },
    { kind: 'stop', w: 7  },
    { kind: 'move', w: 14 },
    { kind: 'stop', w: 3  },
  ];
}

// ── Mock route path (FALLBACK when no backend history) ──────────────────────
// Generates a deterministic La Paz lat/lng track used when useDriverHistory
// returns empty. Comment out this fallback once the TimescaleDB pipeline
// is fully populated for all tenants in staging/production.
const BASE_LAT = -16.495;
const BASE_LNG = -68.133;

// Waypoints roughly following streets in La Paz / Zona Sur
const WAYPOINTS: [number, number, number][] = [ // [lat, lng, speedKmh]
  [-16.540, -68.076,  0],  // Depot
  [-16.534, -68.072, 42],
  [-16.529, -68.068, 58],
  [-16.524, -68.063, 48],
  [-16.520, -68.058, 22],
  [-16.517, -68.055,  8],
  [-16.514, -68.049, 32],
  [-16.510, -68.044, 46],  // Stop 1
  [-16.507, -68.040, 38],
  [-16.503, -68.035, 28],
  [-16.499, -68.030, 18],
  [-16.498, -68.025, 36],  // Stop 2
  [-16.496, -68.020, 52],
  [-16.494, -68.015, 62],
  [-16.491, -68.010, 58],
  [-16.489, -68.007, 30],
  [-16.487, -68.004, 18],  // Stop 3
  [-16.490, -68.009, 24],
  [-16.494, -68.015, 38],
  [-16.499, -68.021, 52],
  [-16.504, -68.027, 42],
  [-16.508, -68.033, 12],  // Stop 4
];

export function getMockRoutePath(): HistoryPosition[] {
  // MOCK FALLBACK — each point is spaced ~30 seconds apart starting at 07:30
  const START_ISO = new Date();
  START_ISO.setHours(7, 30, 0, 0);

  return WAYPOINTS.map(([lat, lng, spd], i) => {
    const t = new Date(START_ISO.getTime() + i * 30000);
    return {
      time: t.toISOString(),
      driverId: 'mock-driver',
      tenantId: 'tenant-1',
      latitude: lat,
      longitude: lng,
      speed: spd,
      heading: 0,
      altitude: 3600,
      accuracy: null,
      routeId: null,
      visitId: null,
      customerName: null,
      distanceToNextM: null,
      etaToNextSec: null,
    } satisfies HistoryPosition;
  });
}

export function _unusedBaseCoords() { return { BASE_LAT, BASE_LNG }; }

// ── Playback tick labels (HH:MM) from positions ──────────────────────────────
export function getPlaybackTicks(positions: HistoryPosition[], count = 8): string[] {
  if (positions.length === 0) return [];
  const start = new Date(positions[0].time).getTime();
  const end   = new Date(positions[positions.length - 1].time).getTime();
  const step  = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const ms = start + i * step;
    const d  = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
}

// ── Format duration from minutes ────────────────────────────────────────────
export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
