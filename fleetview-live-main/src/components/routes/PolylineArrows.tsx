import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-polylinedecorator';
import type { LatLngExpression } from 'leaflet';

interface PolylineArrowsProps {
  positions: LatLngExpression[];
  color?: string;
  /** Pixel gap between arrow symbols */
  pixelRepeat?: number;
}

/**
 * Renders directional arrow markers along a polyline
 * using leaflet-polylinedecorator.
 */
export function PolylineArrows({
  positions,
  color = 'hsl(217, 91%, 45%)',
  pixelRepeat = 80,
}: PolylineArrowsProps) {
  const map = useMap();
  const decoratorRef = useRef<L.PolylineDecorator | null>(null);

  useEffect(() => {
    if (positions.length < 2) return;

    // Clean up previous decorator
    if (decoratorRef.current) {
      map.removeLayer(decoratorRef.current);
    }

    const polyline = L.polyline(positions);

    const decorator = L.polylineDecorator(polyline, {
      patterns: [
        {
          offset: '30px',
          repeat: pixelRepeat,
          symbol: L.Symbol.arrowHead({
            pixelSize: 10,
            polygon: false,
            pathOptions: {
              color,
              weight: 2.5,
              opacity: 0.9,
            },
          }),
        },
      ],
    });

    decorator.addTo(map);
    decoratorRef.current = decorator;

    return () => {
      if (decoratorRef.current) {
        map.removeLayer(decoratorRef.current);
        decoratorRef.current = null;
      }
    };
  }, [positions, map, color, pixelRepeat]);

  return null;
}
