import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import * as L from "leaflet";
import { ZoomIn, ZoomOut, Locate, Navigation, Layers } from "lucide-react";
import { useMapStore } from "@/stores/map.store";
import { cn } from "@/lib/utils";

const DEFAULT_CENTER: L.LatLngExpression = [-16.5, -68.1]; // La Paz

function CtrlButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-[30px] w-[30px] items-center justify-center transition-colors",
        active ? "text-mc-accent" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Floating map controls (top-right). Rendered inside MapContainer so it can drive the Leaflet map. */
export function MapControls() {
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);
  const positions = useMapStore((s) => s.positions);
  const following = useMapStore((s) => s.followDriver);
  const toggleFollow = useMapStore((s) => s.toggleFollowDriver);

  // Don't let clicks/scrolls on the controls pan or zoom the map underneath.
  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);

  const recenter = () => {
    const pts = Object.values(positions);
    if (pts.length > 0) {
      const bounds = L.latLngBounds(pts.map((p) => [p.latitude, p.longitude] as [number, number]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    } else {
      map.setView(DEFAULT_CENTER, 12);
    }
  };

  const cellBox = "overflow-hidden rounded-md border border-border bg-mc-elev shadow-mc-card";

  return (
    <div ref={ref} className="absolute right-3.5 top-3.5 z-[1000] flex flex-col gap-1.5">
      <div className={cn(cellBox, "flex flex-col")}>
        <CtrlButton label="Zoom in" onClick={() => map.zoomIn()}>
          <ZoomIn className="h-4 w-4" />
        </CtrlButton>
        <div className="h-px bg-border" />
        <CtrlButton label="Zoom out" onClick={() => map.zoomOut()}>
          <ZoomOut className="h-4 w-4" />
        </CtrlButton>
      </div>

      <div className={cellBox}>
        <CtrlButton label="Recenter on fleet" onClick={recenter}>
          <Locate className="h-4 w-4" />
        </CtrlButton>
      </div>

      <div className={cn(cellBox, following && "border-mc-accent-border")}>
        <CtrlButton label="Follow selected driver" active={following} onClick={toggleFollow}>
          <Navigation className="h-4 w-4" />
        </CtrlButton>
      </div>

      <div className={cellBox}>
        <CtrlButton label="Layers">
          <Layers className="h-4 w-4" />
        </CtrlButton>
      </div>
    </div>
  );
}
