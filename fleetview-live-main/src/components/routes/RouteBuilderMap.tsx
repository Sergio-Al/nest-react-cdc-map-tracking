import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { DivIcon, LatLngExpression, LatLngBounds } from 'leaflet';
import * as L from 'leaflet';
import { useTheme } from 'next-themes';
import { ZoomIn, ZoomOut, Locate, Navigation, Layers } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import type { PlannedVisit } from '@/types/visit.types';
import type { Customer } from '@/types/customer.types';
import type { RouteGeometry } from '@/hooks/api/useRouteBuilder';
import { decodePolyline } from '@/lib/polyline';
import { cn } from '@/lib/utils';
import { PolylineArrows } from './PolylineArrows';

interface RouteBuilderMapProps {
  visits: PlannedVisit[];
  customers: Customer[];
  geometry: RouteGeometry | null;
  /** Add a customer as a stop directly from its map pin. */
  onQuickAdd: (customerId: number) => void;
  /** Open the add-stop palette (zero-state CTA). */
  onOpenPalette: () => void;
  /** Whether the route has no stops yet (drives the zero-state overlay). */
  isEmpty: boolean;
}

function FitBounds({ positions }: { positions: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 14, { animate: true });
      return;
    }
    map.fitBounds(new LatLngBounds(positions).pad(0.18), { animate: true, maxZoom: 15 });
    // Re-fit only when the number of points changes, not on every pan/identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length, map]);
  return null;
}

function numberedIcon(index: number, completed: boolean): DivIcon {
  const bg = completed ? 'var(--mc-status-moving)' : 'var(--mc-accent)';
  const fg = completed ? '#fff' : 'var(--mc-accent-fg)';
  return new DivIcon({
    className: 'route-stop-marker',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${bg};border:2px solid var(--mc-bg-elev);box-shadow:0 2px 6px oklch(0 0 0 / 0.35);color:${fg};font-family:'Geist Mono',monospace;font-weight:700;font-size:11px;">${index + 1}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

const depotIcon = new DivIcon({
  className: 'depot-marker',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px 9px 9px 2px;transform:rotate(45deg);background:var(--mc-text);border:2px solid var(--mc-bg-elev);box-shadow:0 2px 8px oklch(0 0 0 / 0.4);">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mc-bg-elev)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(-45deg)"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  </div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 27],
});

const customerPinIcon = new DivIcon({
  className: 'customer-pin',
  html: `<div style="width:11px;height:11px;border-radius:9999px;border:2px solid var(--mc-map-label);background:var(--mc-bg-elev);box-shadow:0 1px 3px oklch(0 0 0 / 0.4);transition:transform .12s"></div>`,
  iconSize: [11, 11],
  iconAnchor: [5.5, 5.5],
});

function CtrlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-[30px] w-[30px] items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}

function RouteMapControls({ fit }: { fit: LatLngExpression[] }) {
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);

  const recenter = () => {
    if (fit.length >= 2) map.fitBounds(new LatLngBounds(fit).pad(0.18), { maxZoom: 15 });
    else if (fit.length === 1) map.setView(fit[0], 14);
    else map.setView([-16.5, -68.1], 12);
  };

  const cell = 'overflow-hidden rounded-md border border-border bg-mc-elev shadow-mc-card';
  return (
    <div ref={ref} className="absolute right-3.5 top-3.5 z-[1000] flex flex-col gap-1.5">
      <div className={cn(cell, 'flex flex-col')}>
        <CtrlButton label="Zoom in" onClick={() => map.zoomIn()}><ZoomIn className="h-4 w-4" /></CtrlButton>
        <div className="h-px bg-border" />
        <CtrlButton label="Zoom out" onClick={() => map.zoomOut()}><ZoomOut className="h-4 w-4" /></CtrlButton>
      </div>
      <div className={cell}><CtrlButton label="Fit route" onClick={recenter}><Locate className="h-4 w-4" /></CtrlButton></div>
      <div className={cell}><CtrlButton label="Recenter" onClick={recenter}><Navigation className="h-4 w-4" /></CtrlButton></div>
      <div className={cell}><CtrlButton label="Layers"><Layers className="h-4 w-4" /></CtrlButton></div>
    </div>
  );
}

function ZeroState({ onOpenPalette }: { onOpenPalette: () => void }) {
  const rows: { label: React.ReactNode; keys: string[] }[] = [
    { label: 'Open the palette', keys: ['⌘', 'K'] },
    { label: 'Click any pin on the map', keys: ['Click'] },
    { label: <><span className="font-semibold text-foreground">Optimize</span> when you have 3+ stops</>, keys: ['⌘', 'O'] },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center">
      <div className="pointer-events-auto w-[380px] max-w-[80%] rounded-mc-lg border border-mc-border-strong bg-mc-elev/95 p-5 shadow-mc-float backdrop-blur">
        <h3 className="text-[15px] font-semibold text-foreground">Start building the route</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-mc-text-muted">
          Click a customer pin on the map, search via the command palette, or pick from a list of
          frequent stops to begin.
        </p>
        <div className="mt-4 space-y-px overflow-hidden rounded-mc border border-border">
          {rows.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={i === 0 ? onOpenPalette : undefined}
              className={cn(
                'flex w-full items-center justify-between bg-mc-surface px-3 py-2 text-[12.5px] text-mc-text-muted transition-colors',
                i === 0 && 'hover:bg-mc-surface-hi hover:text-foreground',
              )}
            >
              <span>{r.label}</span>
              <span className="flex items-center gap-1">
                {r.keys.map((k) => (
                  <kbd key={k} className="rounded border border-border bg-mc-elev px-1.5 py-px font-mono text-[10.5px] text-mc-text-dim">
                    {k}
                  </kbd>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RouteBuilderMap({
  visits,
  customers,
  geometry,
  onQuickAdd,
  onOpenPalette,
  isEmpty,
}: RouteBuilderMapProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const visitCustomerIds = useMemo(() => new Set(visits.map((v) => v.customerId)), [visits]);

  const visitPositions = useMemo(
    () =>
      visits
        .map((v) => {
          const c = customerMap.get(v.customerId);
          if (c?.latitude == null || c?.longitude == null) return null;
          return { visit: v, customer: c, position: [c.latitude, c.longitude] as LatLngExpression };
        })
        .filter(Boolean) as { visit: PlannedVisit; customer: Customer; position: LatLngExpression }[],
    [visits, customerMap],
  );

  // Addable customers (not already a stop) → quick-add pins.
  const addable = useMemo(
    () =>
      customers.filter(
        (c) => c.active && c.latitude != null && c.longitude != null && !visitCustomerIds.has(c.id),
      ),
    [customers, visitCustomerIds],
  );

  const roadPolyline = useMemo(
    () => (geometry?.geometry ? (decodePolyline(geometry.geometry) as LatLngExpression[]) : null),
    [geometry?.geometry],
  );
  const depotPosition = useMemo<LatLngExpression | null>(
    () => (geometry?.depot ? [geometry.depot.lat, geometry.depot.lon] : null),
    [geometry?.depot],
  );
  const straightLine = visitPositions.map((vp) => vp.position);

  const fit = useMemo(() => {
    const pts = visitPositions.map((vp) => vp.position);
    if (depotPosition) pts.unshift(depotPosition);
    return pts;
  }, [visitPositions, depotPosition]);

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  return (
    <div className="relative isolate min-w-0 flex-1 overflow-hidden">
      <MapContainer center={[-16.51, -68.1]} zoom={13} className="h-full w-full" zoomControl={false}>
        <TileLayer
          key={isDark ? 'dark' : 'light'}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={tileUrl}
        />

        <FitBounds positions={fit} />

        {/* Addable customer pins (quick-add) */}
        {addable.map((c) => (
          <Marker
            key={`cust-${c.id}`}
            position={[c.latitude!, c.longitude!]}
            icon={customerPinIcon}
            eventHandlers={{ click: () => onQuickAdd(c.id) }}
          >
            <Popup>
              <div className="min-w-[160px] p-1">
                <h3 className="text-sm font-bold">{c.name}</h3>
                {c.address && <p className="mt-0.5 text-xs text-gray-500">{c.address}</p>}
                <button
                  type="button"
                  onClick={() => onQuickAdd(c.id)}
                  className="mt-2 w-full rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                >
                  + Add stop
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Route line */}
        {roadPolyline && roadPolyline.length >= 2 ? (
          <>
            <Polyline positions={roadPolyline} pathOptions={{ color: 'var(--mc-accent)', weight: 4, opacity: 0.9 }} />
            <PolylineArrows positions={roadPolyline} />
          </>
        ) : (
          straightLine.length >= 2 && (
            <Polyline
              positions={straightLine}
              pathOptions={{ color: 'var(--mc-accent)', weight: 3, opacity: 0.7, dashArray: '8, 6' }}
            />
          )
        )}

        {/* Depot */}
        {depotPosition && (
          <Marker position={depotPosition} icon={depotIcon}>
            <Popup>
              <div className="min-w-[140px] p-1">
                <h3 className="text-sm font-bold">Depot</h3>
                <p className="mt-0.5 text-xs text-gray-500">Start &amp; end of route</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Stops */}
        {visitPositions.map((vp, idx) => (
          <Marker key={vp.visit.id} position={vp.position} icon={numberedIcon(idx, vp.visit.status === 'completed')}>
            <Popup>
              <div className="min-w-[180px] p-1">
                <h3 className="text-sm font-bold">#{idx + 1} {vp.customer.name}</h3>
                {vp.customer.address && <p className="mt-0.5 text-xs text-gray-500">{vp.customer.address}</p>}
                <p className="mt-1 text-xs"><span className="font-medium">Status:</span> {vp.visit.status.replace('_', ' ')}</p>
                {vp.visit.estimatedArrivalTime && (
                  <p className="text-xs"><span className="font-medium">ETA:</span> {new Date(vp.visit.estimatedArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        <RouteMapControls fit={fit} />
      </MapContainer>

      {isEmpty && <ZeroState onOpenPalette={onOpenPalette} />}
    </div>
  );
}
