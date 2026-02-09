import { MapPin, Route, Phone, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Driver } from "@/types/driver.types";
import type { EnrichedPosition } from "@/types/position.types";

type DriverWithPosition = Driver & {
  position?: EnrichedPosition;
};

type DriverStatus = "moving" | "idle" | "offline";

interface DriverCardProps {
  driver: DriverWithPosition;
  selected?: boolean;
  onSelect?: (id: string) => void;
  status: DriverStatus;
}

export function DriverCard({ driver, selected, onSelect, status }: DriverCardProps) {
  const statusClasses = {
    moving: "status-dot-active",
    idle: "status-dot-idle",
    offline: "status-dot-offline",
  };

  const borderClasses = {
    moving: "border-l-fleet-active",
    idle: "border-l-fleet-idle",
    offline: "border-l-fleet-offline",
  };

  const formatLastUpdate = (time?: string) => {
    if (!time) return "No data";
    const ageMs = new Date().getTime() - new Date(time).getTime();
    const ageSeconds = Math.floor(ageMs / 1000);
    
    if (ageSeconds < 60) return `${ageSeconds}s ago`;
    if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m ago`;
    return `${Math.floor(ageSeconds / 3600)}h ago`;
  };

  const speed = driver.position ? Math.round(driver.position.speed * 1.852) : 0; // knots to km/h
  const lastUpdate = formatLastUpdate(driver.position?.time);
  const plate = driver.vehiclePlate || "N/A";

  return (
    <div
      onClick={() => onSelect?.(driver.id)}
      className={cn(
        "p-3 rounded-lg border border-border/50 cursor-pointer transition-all duration-150 border-l-[3px]",
        borderClasses[status],
        selected
          ? "bg-primary/5 border-primary/30 shadow-sm"
          : "bg-card hover:bg-secondary/50",
        status === "offline" && "opacity-60"
      )}
    >
      {/* Name row */}
      <div className="flex items-center gap-2 mb-2">
        <div className={statusClasses[status]} />
        <span className="font-semibold text-sm truncate">{driver.name}</span>
        <span className="text-xs text-muted-foreground ml-auto font-mono">
          {plate}
        </span>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
        <span className="font-mono">
          🚗 {speed} km/h
        </span>
        <span>•</span>
        <span>🕐 {lastUpdate}</span>
      </div>

      {/* Location (if available) */}
      {driver.position && (
        <div className="text-xs text-muted-foreground truncate">
          <MapPin className="w-3 h-3 inline mr-1" />
          {driver.position.latitude.toFixed(6)}, {driver.position.longitude.toFixed(6)}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex items-center gap-1 mt-2.5">
        <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded transition-colors">
          <Eye className="w-3 h-3" /> View
        </button>
        <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded transition-colors">
          <Route className="w-3 h-3" /> Route
        </button>
        <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded transition-colors">
          <Phone className="w-3 h-3" /> Call
        </button>
      </div>
    </div>
  );
}
