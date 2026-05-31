import { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  useMap,
} from 'react-leaflet';
import { DivIcon, LatLngBounds, type LatLngExpression } from 'leaflet';
import { useTheme } from 'next-themes';
import 'leaflet/dist/leaflet.css';
import { usePlaybackStore } from '@/stores/playback.store';
import { MapControls } from '@/components/dashboard/MapControls';
import { RouteHistoryPlaybackBar } from './RouteHistoryPlaybackBar';
import {
  speedColor,
  tripSummaryFrom,
  getMockHistStops,
  getMockIdleMarkers,
} from '@/lib/mock/historyMock';
import type { HistoryPosition } from '@/types/history.types';
import type { FilterToggles } from './RouteHistoryFilter';
import type { Driver } from '@/types/driver.types';
import { fmtDuration } from '@/lib/mock/historyMock';

// La Paz default center
const DEFAULT_CENTER: LatLngExpression = [-16.5, -68.1];

// ── Map effect: fit to route bounds on load ──────────────────────────────────
function FitBounds({ positions }: { positions: HistoryPosition[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length < 2) return;
    const bounds = new LatLngBounds(
      positions.map((p) => [p.latitude, p.longitude] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
  }, [positions, map]);
  return null;
}

// ── Speed-coloured polyline segments ────────────────────────────────────────
interface PolySegment {
  positions: LatLngExpression[];
  color: string;
}

function buildColoredSegments(
  positions: HistoryPosition[],
  upToIndex: number,
): PolySegment[] {
  const slice = positions.slice(0, upToIndex + 1);
  if (slice.length < 2) return [];

  const segs: PolySegment[] = [];
  for (let i = 0; i < slice.length - 1; i++) {
    const p1 = slice[i];
    const p2 = slice[i + 1];
    const color = speedColor(p1.speed);
    const from: LatLngExpression = [p1.latitude, p1.longitude];
    const to: LatLngExpression = [p2.latitude, p2.longitude];

    if (segs.length > 0 && segs[segs.length - 1].color === color) {
      segs[segs.length - 1].positions.push(to);
    } else {
      segs.push({ positions: [from, to], color });
    }
  }
  return segs;
}

// ── Stop pin DivIcon ─────────────────────────────────────────────────────────
function makeStopIcon(label: string, kind: 'start' | 'stop' | 'end'): DivIcon {
  const isFilled = kind === 'start' || kind === 'end';
  return new DivIcon({
    className: '',
    html: `
      <div style="
        width:22px;height:22px;border-radius:50%;
        background:${isFilled ? 'var(--mc-accent)' : 'var(--mc-bg-elev)'};
        border:2px solid var(--mc-accent);
        display:grid;place-items:center;
        font-family:'Geist Mono',monospace;font-size:10px;font-weight:700;
        color:${isFilled ? 'var(--mc-accent-fg)' : 'var(--mc-accent)'};
        box-shadow:0 4px 10px oklch(0 0 0 / 0.18);
      ">${label}</div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// ── Idle pin DivIcon ─────────────────────────────────────────────────────────
const IDLE_ICON = new DivIcon({
  className: '',
  html: `
    <div style="
      width:14px;height:14px;border-radius:50%;
      background:var(--mc-status-idle);
      border:2px solid var(--mc-bg-elev);
      box-shadow:0 2px 6px oklch(0 0 0 / 0.2);
    "></div>
  `,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// ── Current position pin (accent dot + pulse ring) ───────────────────────────
const CURRENT_ICON = new DivIcon({
  className: '',
  html: `
    <div style="position:relative;width:22px;height:22px;">
      <span class="animate-pinpulse" style="
        position:absolute;inset:-5px;border-radius:50%;
        background:var(--mc-accent-soft);
      "></span>
      <div style="
        position:absolute;inset:0;border-radius:50%;
        background:var(--mc-accent);
        border:3px solid var(--mc-bg-elev);
        box-shadow:0 4px 12px oklch(0 0 0 / 0.25);
      "></div>
    </div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// ── Speed legend ─────────────────────────────────────────────────────────────
const SPEED_LEGEND = [
  { color: 'oklch(0.6 0.005 250)',  label: '< 5' },
  { color: 'oklch(0.75 0.15 80)',   label: '5–20' },
  { color: 'oklch(0.72 0.16 150)',  label: '20–40' },
  { color: 'oklch(0.6 0.14 245)',   label: '40–60' },
  { color: 'oklch(0.62 0.2 25)',    label: '> 60' },
];

// ── Route summary chip ───────────────────────────────────────────────────────
function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('');
}

interface RouteSummaryProps {
  driver: Driver;
  positions: HistoryPosition[];
}

function RouteSummaryChip({ driver, positions }: RouteSummaryProps) {
  const summary = useMemo(() => tripSummaryFrom(positions), [positions]);
  const dateStr = positions.length > 0
    ? new Date(positions[0].time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '';

  return (
    <div
      className="absolute left-[14px] z-[1000] flex items-center overflow-hidden rounded-[8px] border border-mc-border-strong bg-mc-elev shadow-mc-float"
      style={{ top: 56, borderRadius: 8 }}
    >
      {/* Driver info */}
      <div className="flex items-center gap-[9px] border-r border-border px-[14px] py-2">
        <span
          className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mc-accent-soft font-mono text-[10.5px] font-bold text-mc-accent"
        >
          {initials(driver.name)}
        </span>
        <div>
          <div className="text-[12.5px] font-semibold">{driver.name}</div>
          <div className="font-mono text-[10.5px] text-mc-text-dim">
            {driver.vehiclePlate ?? '—'} · {dateStr}
          </div>
        </div>
      </div>

      {/* Stats */}
      {[
        { lbl: 'Distance', val: `${summary.distanceKm}`, unit: 'km' },
        { lbl: 'Duration', val: fmtDuration(summary.durationMin), unit: '' },
        { lbl: 'Stops',    val: `${summary.stops}`, unit: '/ 10' },
        { lbl: 'Avg speed',val: `${summary.avgSpeedKmh}`, unit: 'km/h' },
      ].map(({ lbl, val, unit }) => (
        <div
          key={lbl}
          className="flex min-w-[70px] flex-col gap-px border-r border-border px-[14px] py-[6px] last:border-r-0"
        >
          <div className="text-[9.5px] font-medium uppercase tracking-[0.07em] text-mc-text-dim">
            {lbl}
          </div>
          <div className="font-mono text-[13px] font-semibold tracking-[-0.005em]">
            {val}
            {unit && <span className="ml-[2px] text-[10px] font-normal text-mc-text-dim">{unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
interface RouteHistoryMapProps {
  driver: Driver | null;
  toggles: FilterToggles;
  showPlayback: boolean;
}

export function RouteHistoryMap({ driver, toggles, showPlayback }: RouteHistoryMapProps) {
  const { positions, currentIndex } = usePlaybackStore();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  const hasRoute = positions.length > 0;

  // Colored segments up to currentIndex
  const coloredSegs = useMemo(
    () => (hasRoute && toggles.speedPath ? buildColoredSegments(positions, currentIndex) : []),
    [positions, currentIndex, hasRoute, toggles.speedPath],
  );

  // Faint full path
  const fullPath = useMemo(
    () => positions.map((p): LatLngExpression => [p.latitude, p.longitude]),
    [positions],
  );

  // Mock stops & idles (replaced by real data when available)
  const mockStops = useMemo(
    () => (driver ? getMockHistStops(driver.id) : []),
    [driver],
  );
  const mockIdles = useMemo(
    () => (driver ? getMockIdleMarkers(driver.id) : []),
    [driver],
  );

  const currentPos = positions[currentIndex] ?? null;

  return (
    <div className="relative isolate h-full w-full overflow-hidden">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={12}
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          key={isDark ? 'dark' : 'light'}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={tileUrl}
        />

        <FitBounds positions={positions} />

        {/* Controls inside map */}
        <MapControls />

        {/* Faint full path */}
        {hasRoute && (
          <Polyline
            positions={fullPath}
            pathOptions={{
              color: 'oklch(0.5 0.005 60)',
              weight: 5,
              opacity: 0.2,
              dashArray: '2 6',
            }}
          />
        )}

        {/* Speed-coloured segments */}
        {coloredSegs.map((seg, i) => (
          <Polyline
            key={`seg-${i}`}
            positions={seg.positions}
            pathOptions={{ color: seg.color, weight: 6, opacity: 0.95 }}
          />
        ))}

        {/* Stop markers */}
        {hasRoute && toggles.stopMarkers &&
          mockStops.map((s) => (
            <Marker
              key={`stop-${s.idx}`}
              position={[s.lat, s.lng]}
              icon={makeStopIcon(
                s.kind === 'start' ? 'A' : s.kind === 'end' ? '★' : String(s.idx),
                s.kind,
              )}
            />
          ))}

        {/* Idle markers */}
        {hasRoute && toggles.idleEvents &&
          mockIdles.map((m, i) => (
            <Marker key={`idle-${i}`} position={[m.lat, m.lng]} icon={IDLE_ICON} />
          ))}

        {/* Current position pin during playback */}
        {showPlayback && currentPos && (
          <Marker
            position={[currentPos.latitude, currentPos.longitude]}
            icon={CURRENT_ICON}
          />
        )}
      </MapContainer>

      {/* Route summary chip — rendered outside MapContainer so it's above the map's z-stack */}
      {hasRoute && driver && (
        <RouteSummaryChip driver={driver} positions={positions} />
      )}

      {/* Speed legend */}
      {hasRoute && (
        <div
          className="absolute z-[1000] rounded-[8px] border border-border bg-mc-elev p-[9px_11px] shadow-mc-card"
          style={{ bottom: showPlayback ? 90 : 14, right: 14 }}
        >
          <div className="mb-[6px] text-[9.5px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            Speed
          </div>
          <div className="flex flex-col gap-1">
            {SPEED_LEGEND.map(({ color, label }) => (
              <div key={label} className="flex items-center gap-[6px]">
                <span
                  className="h-1 w-[22px] rounded-[2px]"
                  style={{ background: color }}
                />
                <span className="font-mono text-[10.5px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 text-right font-mono text-[10px] text-mc-text-dim">km/h</div>
        </div>
      )}

      {/* Playback bar */}
      {showPlayback && <RouteHistoryPlaybackBar />}
    </div>
  );
}
