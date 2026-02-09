import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon, DivIcon, LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapStore } from '@/stores/map.store';
import { MapControls } from './MapControls';
import { MapLegend } from './MapLegend';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface TrackingMapProps {
  selectedDriverId: string | null;
  onSelectDriver: (id: string) => void;
}

// Component to fly to selected driver
function MapController({ selectedDriverId }: { selectedDriverId: string | null }) {
  const map = useMap();
  const positions = useMapStore((state) => state.positions);

  useEffect(() => {
    if (selectedDriverId && positions[selectedDriverId]) {
      const pos = positions[selectedDriverId];
      map.flyTo([pos.latitude, pos.longitude], 15, {
        duration: 1.5,
      });
    }
  }, [selectedDriverId, positions, map]);

  return null;
}

export function TrackingMap({ selectedDriverId, onSelectDriver }: TrackingMapProps) {
  const positions = useMapStore((state) => state.positions);
  const positionsArray = Object.values(positions);

  // Default center - Bolivia La Paz area
  const defaultCenter: LatLngExpression = [-16.5, -68.1];
  const defaultZoom = 12;

  // Calculate center from driver positions
  const mapCenter: LatLngExpression = positionsArray.length > 0
    ? [
        positionsArray.reduce((sum, p) => sum + p.latitude, 0) / positionsArray.length,
        positionsArray.reduce((sum, p) => sum + p.longitude, 0) / positionsArray.length,
      ]
    : defaultCenter;

  // Get driver status based on speed and time
  const getDriverStatus = (position: typeof positionsArray[0]) => {
    const ageMs = new Date().getTime() - new Date(position.time).getTime();
    const ageMinutes = ageMs / 1000 / 60;

    if (ageMinutes > 5) return 'offline';
    if (position.speed > 2) return 'moving';
    return 'idle';
  };

  // Get color based on status
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'moving':
        return 'bg-green-500';
      case 'idle':
        return 'bg-yellow-500';
      case 'offline':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  // Create custom marker icon
  const createDriverIcon = (position: typeof positionsArray[0], isSelected: boolean) => {
    const status = getDriverStatus(position);
    const colorClass = getStatusColor(status);
    const size = isSelected ? 44 : 36;

    return new DivIcon({
      className: 'custom-driver-marker',
      html: `
        <div class="relative" style="width: ${size}px; height: ${size}px;">
          ${isSelected ? '<div class="absolute inset-0 rounded-full animate-ping opacity-75 ' + colorClass + '"></div>' : ''}
          <div class="absolute inset-0 rounded-full ${colorClass} border-2 border-white shadow-lg flex items-center justify-center"
               style="transform: rotate(${position.heading}deg);">
            <div style="transform: rotate(-${position.heading}deg);" class="text-white font-bold text-xs">
              ${position.driverName.split(' ').map(n => n[0]).join('')}
            </div>
          </div>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  };

  return (
    <div className="flex-1 bento-card relative overflow-hidden min-h-0">
      <MapContainer
        center={mapCenter}
        zoom={defaultZoom}
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapController selectedDriverId={selectedDriverId} />

        {/* Driver markers */}
        {positionsArray.map((position) => {
          const isSelected = position.driverId === selectedDriverId;
          const status = getDriverStatus(position);

          return (
            <Marker
              key={position.driverId}
              position={[position.latitude, position.longitude]}
              icon={createDriverIcon(position, isSelected)}
              eventHandlers={{
                click: () => onSelectDriver(position.driverId),
              }}
            >
              <Popup>
                <div className="min-w-[200px] p-2">
                  <h3 className="font-bold text-sm mb-1">{position.driverName}</h3>
                  <div className="text-xs space-y-1">
                    <p>
                      <span className="font-medium">Speed:</span> {position.speed.toFixed(1)} km/h
                    </p>
                    <p>
                      <span className="font-medium">Status:</span>{' '}
                      <span className={cn(
                        'inline-block w-2 h-2 rounded-full mr-1',
                        getStatusColor(status)
                      )} />
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </p>
                    {position.nextCustomerName && (
                      <>
                        <p>
                          <span className="font-medium">Next Stop:</span> {position.nextCustomerName}
                        </p>
                        {position.distanceToNextM && (
                          <p>
                            <span className="font-medium">Distance:</span>{' '}
                            {(position.distanceToNextM / 1000).toFixed(2)} km
                          </p>
                        )}
                        {position.etaToNextSec && (
                          <p>
                            <span className="font-medium">ETA:</span>{' '}
                            {Math.round(position.etaToNextSec / 60)} min
                          </p>
                        )}
                      </>
                    )}
                    <p className="text-muted-foreground text-[10px] mt-2">
                      Updated {formatDistanceToNow(new Date(position.time), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <MapControls
        showRoutes={false}
        showGeofences={false}
        showHeatmap={false}
        onToggleRoutes={() => {}}
        onToggleGeofences={() => {}}
        onToggleHeatmap={() => {}}
        mapStyle="streets"
        onSetMapStyle={() => {}}
      />

      <MapLegend />

      <div className="absolute bottom-4 right-4 z-[999] text-[10px] text-muted-foreground/70 bg-white/90 px-2 py-1 rounded shadow">
        FleetTrack Map · {positionsArray.length} driver{positionsArray.length !== 1 ? 's' : ''} active
      </div>
    </div>
  );
}
