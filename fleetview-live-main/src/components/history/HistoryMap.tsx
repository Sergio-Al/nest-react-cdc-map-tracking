import { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet';
import { DivIcon, LatLngExpression, LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePlaybackStore } from '@/stores/playback.store';
import type { HistoryPosition } from '@/types/history.types';

// Fit the map to the route bounds
function FitBounds({ positions }: { positions: HistoryPosition[] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) return;

    const lats = positions.map((p) => p.latitude);
    const lngs = positions.map((p) => p.longitude);

    const bounds = new LatLngBounds(
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    );

    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [positions, map]);

  return null;
}

// Follow the playback marker
function FollowMarker({ position }: { position: HistoryPosition | null }) {
  const map = useMap();

  useEffect(() => {
    if (!position) return;
    const currentCenter = map.getCenter();
    const bounds = map.getBounds();

    // Only re-center if the marker is going out of view
    if (!bounds.contains([position.latitude, position.longitude])) {
      map.panTo([position.latitude, position.longitude], { animate: true });
    }
  }, [position, map]);

  return null;
}

// Speed-based polyline coloring
function getSpeedColor(speed: number): string {
  if (speed < 5) return '#94a3b8';    // slate-400 — idle/stopped
  if (speed < 20) return '#f59e0b';   // amber-500 — slow
  if (speed < 40) return '#22c55e';   // green-500 — normal
  if (speed < 60) return '#3b82f6';   // blue-500 — fast
  return '#ef4444';                    // red-500 — very fast
}

export function HistoryMap() {
  const { positions, currentIndex, isPlaying } = usePlaybackStore();

  const defaultCenter: LatLngExpression = [-16.5, -68.1];

  // Build path segments colored by speed
  const pathSegments = useMemo(() => {
    if (positions.length < 2) return [];

    const segments: { positions: LatLngExpression[]; color: string }[] = [];

    for (let i = 0; i < positions.length - 1; i++) {
      const p1 = positions[i];
      const p2 = positions[i + 1];
      const color = getSpeedColor(p1.speed);
      const from: LatLngExpression = [p1.latitude, p1.longitude];
      const to: LatLngExpression = [p2.latitude, p2.longitude];

      // Merge with previous segment if same color
      if (segments.length > 0 && segments[segments.length - 1].color === color) {
        segments[segments.length - 1].positions.push(to);
      } else {
        segments.push({ positions: [from, to], color });
      }
    }

    return segments;
  }, [positions]);

  // Traversed vs remaining path split at cursor
  const traversedPath = useMemo(() => {
    return positions
      .slice(0, currentIndex + 1)
      .map((p): LatLngExpression => [p.latitude, p.longitude]);
  }, [positions, currentIndex]);

  const remainingPath = useMemo(() => {
    return positions
      .slice(currentIndex)
      .map((p): LatLngExpression => [p.latitude, p.longitude]);
  }, [positions, currentIndex]);

  const currentPosition = positions[currentIndex] ?? null;

  // Unique visit stops (deduplicated by visitId)
  const visitStops = useMemo(() => {
    const seen = new Set<string>();
    const stops: { lat: number; lng: number; name: string; visitId: string }[] = [];

    for (const p of positions) {
      if (p.visitId && p.customerName && !seen.has(p.visitId)) {
        seen.add(p.visitId);
        stops.push({
          lat: p.latitude,
          lng: p.longitude,
          name: p.customerName,
          visitId: p.visitId,
        });
      }
    }
    return stops;
  }, [positions]);

  // Playback marker icon
  const playbackIcon = useMemo(() => {
    if (!currentPosition) return undefined;
    const heading = currentPosition.heading ?? 0;
    return new DivIcon({
      className: 'playback-marker',
      html: `
        <div class="relative" style="width: 40px; height: 40px;">
          <div class="absolute inset-0 rounded-full bg-primary/20 animate-ping"></div>
          <div class="absolute inset-1 rounded-full bg-primary border-2 border-white shadow-lg flex items-center justify-center"
               style="transform: rotate(${heading}deg);">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="white">
              <path d="M12 2L4 20l8-5 8 5z"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
  }, [currentPosition?.heading]);

  return (
    <div className="flex-1 bento-card relative overflow-hidden min-h-0 rounded-lg border border-border/50">
      <MapContainer
        center={defaultCenter}
        zoom={12}
        className="h-full w-full"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds positions={positions} />
        {isPlaying && <FollowMarker position={currentPosition} />}

        {/* Remaining path (dimmed) */}
        {remainingPath.length > 1 && (
          <Polyline
            positions={remainingPath}
            pathOptions={{
              color: '#94a3b8',
              weight: 3,
              opacity: 0.35,
              dashArray: '8, 8',
            }}
          />
        )}

        {/* Traversed path (colored by speed) */}
        {traversedPath.length > 1 && (
          <Polyline
            positions={traversedPath}
            pathOptions={{
              color: '#3b82f6',
              weight: 4,
              opacity: 0.85,
            }}
          />
        )}

        {/* Visit stop markers */}
        {visitStops.map((stop) => (
          <CircleMarker
            key={stop.visitId}
            center={[stop.lat, stop.lng]}
            radius={8}
            pathOptions={{
              color: '#8b5cf6',
              fillColor: '#8b5cf6',
              fillOpacity: 0.7,
              weight: 2,
            }}
          >
            <Popup>
              <div className="text-xs font-medium">{stop.name}</div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Start marker */}
        {positions.length > 0 && (
          <CircleMarker
            center={[positions[0].latitude, positions[0].longitude]}
            radius={7}
            pathOptions={{
              color: '#22c55e',
              fillColor: '#22c55e',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <span className="text-xs font-medium">Start</span>
            </Popup>
          </CircleMarker>
        )}

        {/* End marker */}
        {positions.length > 1 && (
          <CircleMarker
            center={[
              positions[positions.length - 1].latitude,
              positions[positions.length - 1].longitude,
            ]}
            radius={7}
            pathOptions={{
              color: '#ef4444',
              fillColor: '#ef4444',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <span className="text-xs font-medium">End</span>
            </Popup>
          </CircleMarker>
        )}

        {/* Playback cursor marker */}
        {currentPosition && playbackIcon && (
          <Marker
            position={[currentPosition.latitude, currentPosition.longitude]}
            icon={playbackIcon}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <p className="font-semibold">{currentPosition.speed?.toFixed(1)} km/h</p>
                {currentPosition.customerName && (
                  <p>Near: {currentPosition.customerName}</p>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Speed legend */}
      <div className="absolute bottom-4 right-4 z-[999] bg-white/90 dark:bg-card/90  rounded-lg shadow-md px-3 py-2">
        <p className="text-[10px] font-medium mb-1.5 text-muted-foreground">Speed</p>
        <div className="flex items-center gap-2 text-[10px]">
          {[
            { color: '#94a3b8', label: '< 5' },
            { color: '#f59e0b', label: '5-20' },
            { color: '#22c55e', label: '20-40' },
            { color: '#3b82f6', label: '40-60' },
            { color: '#ef4444', label: '> 60' },
          ].map(({ color, label }) => (
            <div key={color} className="flex items-center gap-1">
              <div
                className="w-3 h-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span>{label}</span>
            </div>
          ))}
          <span className="text-muted-foreground ml-1">km/h</span>
        </div>
      </div>

      {/* Position counter */}
      {positions.length > 0 && (
        <div className="absolute top-4 right-4 z-[999] text-[10px] text-muted-foreground bg-white/90 px-2 py-1 rounded shadow">
          Point {currentIndex + 1} / {positions.length}
        </div>
      )}
    </div>
  );
}
