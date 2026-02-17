import { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from 'react-leaflet';
import { DivIcon, LatLngExpression, LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PlannedVisit } from '@/types/visit.types';
import type { Customer } from '@/types/customer.types';
import type { RouteGeometry } from '@/hooks/api/useRouteBuilder';
import { decodePolyline } from '@/lib/polyline';
import { PolylineArrows } from './PolylineArrows';

interface RouteBuilderMapProps {
  visits: PlannedVisit[];
  customers: Customer[];
  geometry: RouteGeometry | null;
}

// Fit map bounds to all markers
function FitBounds({ positions }: { positions: LatLngExpression[] }) {
  const map = useMap();
  const prevCount = useRef(positions.length);

  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 15, { animate: true });
      return;
    }
    const bounds = new LatLngBounds(positions);
    map.fitBounds(bounds.pad(0.15), { animate: true, maxZoom: 15 });
    prevCount.current = positions.length;
  }, [positions.length, map]);

  return null;
}

function createNumberedIcon(index: number, isCompleted: boolean): DivIcon {
  const bg = isCompleted ? 'bg-green-500' : 'bg-primary';
  return new DivIcon({
    className: 'route-stop-marker',
    html: `
      <div class="flex items-center justify-center w-7 h-7 rounded-full ${bg} border-2 border-white shadow-lg text-white text-xs font-bold">
        ${index + 1}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const depotIcon = new DivIcon({
  className: 'depot-marker',
  html: `
    <div class="flex items-center justify-center w-8 h-8 rounded-full bg-orange-500 border-2 border-white shadow-lg text-white text-xs font-bold">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

export function RouteBuilderMap({ visits, customers, geometry }: RouteBuilderMapProps) {
  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );

  // Build positions for markers and polyline
  const visitPositions = useMemo(() => {
    return visits
      .map((v) => {
        const c = customerMap.get(v.customerId);
        if (!c?.latitude || !c?.longitude) return null;
        return {
          visit: v,
          customer: c,
          position: [c.latitude, c.longitude] as LatLngExpression,
        };
      })
      .filter(Boolean) as { visit: PlannedVisit; customer: Customer; position: LatLngExpression }[];
  }, [visits, customerMap]);

  const polylinePositions = visitPositions.map((vp) => vp.position);

  // Decode OSRM road geometry if available
  const roadPolyline = useMemo(() => {
    if (!geometry?.geometry) return null;
    return decodePolyline(geometry.geometry) as LatLngExpression[];
  }, [geometry?.geometry]);

  // Depot position
  const depotPosition = useMemo<LatLngExpression | null>(() => {
    if (!geometry?.depot) return null;
    return [geometry.depot.lat, geometry.depot.lon];
  }, [geometry?.depot]);

  // Default center: La Paz
  const defaultCenter: LatLngExpression = [-16.5, -68.1];

  // Include depot in bounds fitting
  const allPositions = useMemo(() => {
    const positions = visitPositions.map((vp) => vp.position);
    if (depotPosition) positions.unshift(depotPosition);
    return positions;
  }, [visitPositions, depotPosition]);

  return (
    <div className="flex-1 relative overflow-hidden min-h-0 rounded-lg border z-0">
      <MapContainer
        center={defaultCenter}
        zoom={13}
        className="h-full w-full"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds
          positions={allPositions}
        />

        {/* Road-following polyline from OSRM */}
        {roadPolyline && roadPolyline.length >= 2 && (
          <>
            <Polyline
              positions={roadPolyline}
              pathOptions={{
                color: 'hsl(217, 91%, 60%)',
                weight: 4,
                opacity: 0.85,
              }}
            />
            <PolylineArrows positions={roadPolyline} />
          </>
        )}

        {/* Fallback: straight dashed lines when geometry isn't loaded yet */}
        {!roadPolyline && polylinePositions.length >= 2 && (
          <Polyline
            positions={polylinePositions}
            pathOptions={{
              color: 'hsl(217, 91%, 60%)',
              weight: 3,
              opacity: 0.7,
              dashArray: '8, 6',
            }}
          />
        )}

        {/* Depot (starting point) marker */}
        {depotPosition && (
          <Marker position={depotPosition} icon={depotIcon}>
            <Popup>
              <div className="min-w-[140px] p-1">
                <h3 className="font-bold text-sm">Starting Point</h3>
                <p className="text-xs text-gray-500 mt-0.5">Driver's current position</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Stop markers */}
        {visitPositions.map((vp, idx) => (
          <Marker
            key={vp.visit.id}
            position={vp.position}
            icon={createNumberedIcon(idx, vp.visit.status === 'completed')}
          >
            <Popup>
              <div className="min-w-[180px] p-1">
                <h3 className="font-bold text-sm">
                  #{idx + 1} {vp.customer.name}
                </h3>
                {vp.customer.address && (
                  <p className="text-xs text-gray-500 mt-0.5">{vp.customer.address}</p>
                )}
                <div className="text-xs mt-1 space-y-0.5">
                  <p>
                    <span className="font-medium">Status:</span>{' '}
                    {vp.visit.status.replace('_', ' ')}
                  </p>
                  {vp.visit.timeWindowStart && vp.visit.timeWindowEnd && (
                    <p>
                      <span className="font-medium">Window:</span>{' '}
                      {vp.visit.timeWindowStart.slice(0, 5)}–{vp.visit.timeWindowEnd.slice(0, 5)}
                    </p>
                  )}
                  {vp.visit.estimatedArrivalTime && (
                    <p>
                      <span className="font-medium">ETA:</span>{' '}
                      {new Date(vp.visit.estimatedArrivalTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                  {vp.visit.estimatedDistanceMeters != null && (
                    <p>
                      <span className="font-medium">Travel:</span>{' '}
                      {(vp.visit.estimatedDistanceMeters / 1000).toFixed(1)} km
                    </p>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
