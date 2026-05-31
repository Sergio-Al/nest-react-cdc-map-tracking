import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import { DivIcon, type LatLngExpression } from 'leaflet';
import { useTheme } from 'next-themes';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/utils';

const DEFAULT_CENTER: [number, number] = [-16.5, -68.15]; // La Paz

const pinIcon = new DivIcon({
  className: 'location-pin',
  html: `<div style="position:relative;width:18px;height:18px;">
    <span style="position:absolute;inset:0;border-radius:9999px;background:var(--mc-accent);border:2px solid var(--mc-bg-elev);box-shadow:0 2px 6px oklch(0 0 0 / 0.4);"></span>
    <span style="position:absolute;inset:-6px;border-radius:9999px;border:2px solid var(--mc-accent);opacity:0.35;"></span>
  </div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

interface LocationPickerMapProps {
  lat: number | null;
  lng: number | null;
  /** Geofence radius in meters; renders a Leaflet Circle when provided. */
  radiusMeters?: number;
  /** Omit to render read-only (no click-to-pin). */
  onChange?: (lat: number, lng: number) => void;
  defaultCenter?: [number, number];
  className?: string;
  height?: number | string;
}

export function LocationPickerMap({
  lat,
  lng,
  radiusMeters,
  onChange,
  defaultCenter = DEFAULT_CENTER,
  className,
  height = 220,
}: LocationPickerMapProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  const hasPin = lat != null && lng != null;
  const center: LatLngExpression = useMemo(
    () => (hasPin ? [lat as number, lng as number] : defaultCenter),
    [hasPin, lat, lng, defaultCenter],
  );

  const readOnly = !onChange;

  return (
    <div
      className={cn('overflow-hidden rounded-[8px] border border-border bg-mc-elev', className)}
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={hasPin ? 15 : 13}
        className="h-full w-full"
        zoomControl={!readOnly}
        dragging={!readOnly}
        scrollWheelZoom={!readOnly}
        doubleClickZoom={!readOnly}
        touchZoom={!readOnly}
        boxZoom={!readOnly}
        keyboard={!readOnly}
      >
        <TileLayer
          key={isDark ? 'dark' : 'light'}
          attribution='&copy; OpenStreetMap &copy; CARTO'
          url={tileUrl}
        />

        {onChange && <ClickHandler onChange={onChange} />}
        {hasPin && <FlyTo lat={lat as number} lng={lng as number} />}

        {hasPin && (
          <>
            <Marker position={[lat as number, lng as number]} icon={pinIcon} />
            {radiusMeters && radiusMeters > 0 && (
              <Circle
                center={[lat as number, lng as number]}
                radius={radiusMeters}
                pathOptions={{
                  color: 'var(--mc-accent)',
                  weight: 1.5,
                  opacity: 0.7,
                  fillColor: 'var(--mc-accent)',
                  fillOpacity: 0.12,
                }}
              />
            )}
          </>
        )}
      </MapContainer>
    </div>
  );
}
