import {
  ZoomIn,
  ZoomOut,
  Crosshair,
  Navigation,
  Layers,
  Map as MapIcon,
  Satellite,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface MapControlsProps {
  showRoutes: boolean;
  showGeofences: boolean;
  showHeatmap: boolean;
  onToggleRoutes: () => void;
  onToggleGeofences: () => void;
  onToggleHeatmap: () => void;
  mapStyle: "streets" | "satellite";
  onSetMapStyle: (style: "streets" | "satellite") => void;
}

export function MapControls({
  showRoutes,
  showGeofences,
  showHeatmap,
  onToggleRoutes,
  onToggleGeofences,
  onToggleHeatmap,
  mapStyle,
  onSetMapStyle,
}: MapControlsProps) {
  const [showLayers, setShowLayers] = useState(false);

  return (
    <div className="absolute top-4 right-4 z-[999] flex flex-col gap-2">
      {/* Zoom */}
      <div className="bento-card p-1 flex flex-col">
        <button className="p-2 hover:bg-secondary rounded-md transition-colors">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button className="p-2 hover:bg-secondary rounded-md transition-colors">
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>

      {/* Fit & Follow */}
      <div className="bento-card p-1 flex flex-col">
        <button className="p-2 hover:bg-secondary rounded-md transition-colors" title="Fit all drivers">
          <Crosshair className="w-4 h-4" />
        </button>
        <button className="p-2 hover:bg-secondary rounded-md transition-colors" title="Follow selected">
          <Navigation className="w-4 h-4" />
        </button>
      </div>

      {/* Layers */}
      <div className="bento-card p-1 relative">
        <button
          onClick={() => setShowLayers(!showLayers)}
          className="p-2 hover:bg-secondary rounded-md transition-colors"
        >
          <Layers className="w-4 h-4" />
        </button>

        {showLayers && (
          <div className="absolute right-full mr-2 top-0 bento-card p-3 w-44 space-y-2 animate-fade-in">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Layers
            </p>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={showRoutes} onChange={onToggleRoutes} className="rounded" />
              Routes
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={showGeofences} onChange={onToggleGeofences} className="rounded" />
              Geofences
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={showHeatmap} onChange={onToggleHeatmap} className="rounded" />
              Heatmap
            </label>

            <div className="h-px bg-border my-2" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Style
            </p>
            <button
              onClick={() => onSetMapStyle("streets")}
              className={cn(
                "flex items-center gap-2 text-xs w-full p-1.5 rounded",
                mapStyle === "streets" ? "bg-primary/10 text-primary" : "hover:bg-secondary"
              )}
            >
              <MapIcon className="w-3.5 h-3.5" /> Streets
            </button>
            <button
              onClick={() => onSetMapStyle("satellite")}
              className={cn(
                "flex items-center gap-2 text-xs w-full p-1.5 rounded",
                mapStyle === "satellite" ? "bg-primary/10 text-primary" : "hover:bg-secondary"
              )}
            >
              <Satellite className="w-3.5 h-3.5" /> Satellite
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
