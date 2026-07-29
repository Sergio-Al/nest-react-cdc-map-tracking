import { memo, useCallback, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { DivIcon, LatLngExpression } from 'leaflet';
import type { TFunction } from 'i18next';
import type { Locale } from 'date-fns';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import 'leaflet/dist/leaflet.css';
import { useMapStore } from '@/stores/map.store';
import { useDateLocale } from '@/i18n/useDateLocale';
import { MapControls } from './MapControls';
import { getDriverStatus, speedKmh, statusColorVar } from '@/lib/driverStatus';
import { formatDistanceToNow } from 'date-fns';
import type { EnrichedPosition } from '@/types/position.types';

interface TrackingMapProps {
  selectedDriverId: string | null;
  onSelectDriver: (id: string) => void;
  /** When provided, only markers for these driver IDs are rendered (fleet filters). */
  visibleDriverIds?: Set<string>;
}

// Flies to the selected driver, and pans to keep them centered while "follow" is on.
function MapController({ selectedDriverId }: { selectedDriverId: string | null }) {
  const map = useMap();
  // Select ONLY the followed driver's position so this controller doesn't re-run
  // on every other driver's movement.
  const selectedPos = useMapStore((s) =>
    selectedDriverId ? s.positions[selectedDriverId] : undefined,
  );
  const followDriver = useMapStore((state) => state.followDriver);
  const mapFocusTick = useMapStore((state) => state.mapFocusTick);

  useEffect(() => {
    if (selectedDriverId && selectedPos) {
      map.flyTo([selectedPos.latitude, selectedPos.longitude], 15, { duration: 1.2 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDriverId, mapFocusTick]);

  useEffect(() => {
    if (followDriver && selectedPos) {
      map.panTo([selectedPos.latitude, selectedPos.longitude], { animate: true });
    }
  }, [selectedPos, followDriver, map]);

  return null;
}

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('');
}

// Icons depend only on (status, initials, isSelected). Cache them so we don't
// allocate a fresh DivIcon per marker per render (which forced react-leaflet to
// call setIcon — an innerHTML swap — on every pin each frame). CSS vars keep the
// colors theme-aware without rebuilding on theme change.
const iconCache = new Map<string, DivIcon>();

function getDriverIcon(position: EnrichedPosition, isSelected: boolean): DivIcon {
  const status = getDriverStatus(position);
  const init = initials(position.driverName);
  const cacheKey = `${status}|${init}|${isSelected}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const color = statusColorVar(status);
  const size = 26;
  const ring =
    status === 'moving'
      ? `<span class="animate-pinpulse" style="position:absolute;inset:0;border-radius:9999px;border:1.5px solid ${color};"></span>`
      : '';

  const icon = new DivIcon({
    className: 'mc-driver-marker',
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        ${ring}
        <div style="position:absolute;inset:0;border-radius:9999px;background:${color};border:2px solid var(--mc-bg-elev);box-shadow:0 2px 6px oklch(0 0 0 / 0.35);display:flex;align-items:center;justify-content:center;${
          isSelected ? 'outline:2px solid var(--mc-accent);outline-offset:2px;' : ''
        }">
          <span style="color:#fff;font-family:'Geist Mono',monospace;font-weight:700;font-size:9.5px;line-height:1;">${init}</span>
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(cacheKey, icon);
  return icon;
}

interface DriverMarkerProps {
  position: EnrichedPosition;
  isSelected: boolean;
  onSelect: (id: string) => void;
  t: TFunction;
  dateLocale: Locale;
}

// Memoized so each flush only re-renders the markers whose position object
// actually changed (the store reuses references for drivers that didn't move).
const DriverMarker = memo(function DriverMarker({
  position,
  isSelected,
  onSelect,
  t,
  dateLocale,
}: DriverMarkerProps) {
  const status = getDriverStatus(position);
  return (
    <Marker
      position={[position.latitude, position.longitude]}
      icon={getDriverIcon(position, isSelected)}
      eventHandlers={{ click: () => onSelect(position.driverId) }}
    >
      <Popup>
        <div className="min-w-[200px] p-1">
          <h3 className="mb-1 text-sm font-bold">{position.driverName}</h3>
          <div className="space-y-1 text-xs">
            <p>
              <span className="font-medium">{t('map.popup.speed')}:</span> {speedKmh(position.speed)} {t('stats.units.kmh')}
            </p>
            <p>
              <span className="font-medium">{t('map.popup.status')}:</span>{' '}
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: statusColorVar(status) }}
              />
              {t(`panel.status.${status}`)}
            </p>
            {position.nextCustomerName && (
              <>
                <p>
                  <span className="font-medium">{t('map.popup.nextStop')}:</span> {position.nextCustomerName}
                </p>
                {position.distanceToNextM != null && (
                  <p>
                    <span className="font-medium">{t('map.popup.distance')}:</span>{' '}
                    {(position.distanceToNextM / 1000).toFixed(2)} {t('stats.units.km')}
                  </p>
                )}
                {position.etaToNextSec != null && (
                  <p>
                    <span className="font-medium">{t('map.popup.eta')}:</span>{' '}
                    {t('map.popup.etaMinutes', { minutes: Math.round(position.etaToNextSec / 60) })}
                  </p>
                )}
              </>
            )}
            <p className="mt-2 text-[10px] text-muted-foreground">
              {t('map.popup.updated', {
                relative: formatDistanceToNow(new Date(position.time), {
                  addSuffix: true,
                  locale: dateLocale,
                }),
              })}
            </p>
          </div>
        </div>
      </Popup>
    </Marker>
  );
});

export function TrackingMap({ selectedDriverId, onSelectDriver, visibleDriverIds }: TrackingMapProps) {
  const positions = useMapStore((state) => state.positions);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { t } = useTranslation('dashboard');
  const dateLocale = useDateLocale();

  const positionsArray = useMemo(
    () =>
      Object.values(positions).filter(
        (p) => !visibleDriverIds || visibleDriverIds.has(p.driverId),
      ),
    [positions, visibleDriverIds],
  );

  // Stable identity so memoized markers don't re-render on every parent render.
  const handleSelect = useCallback((id: string) => onSelectDriver(id), [onSelectDriver]);

  const defaultCenter: LatLngExpression = [-16.5, -68.1];
  const defaultZoom = 12;

  // Initial center only (MapContainer ignores later center prop changes).
  const mapCenter: LatLngExpression =
    positionsArray.length > 0
      ? [
          positionsArray.reduce((sum, p) => sum + p.latitude, 0) / positionsArray.length,
          positionsArray.reduce((sum, p) => sum + p.longitude, 0) / positionsArray.length,
        ]
      : defaultCenter;

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapContainer center={mapCenter} zoom={defaultZoom} className="h-full w-full" zoomControl={false}>
        <TileLayer
          key={isDark ? 'dark' : 'light'}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={tileUrl}
        />

        <MapController selectedDriverId={selectedDriverId} />

        {positionsArray.map((position) => (
          <DriverMarker
            key={position.driverId}
            position={position}
            isSelected={position.driverId === selectedDriverId}
            onSelect={handleSelect}
            t={t}
            dateLocale={dateLocale}
          />
        ))}

        <MapControls />
      </MapContainer>
    </div>
  );
}
