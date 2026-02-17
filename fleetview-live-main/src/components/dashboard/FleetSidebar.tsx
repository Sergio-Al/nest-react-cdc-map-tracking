import { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, Plus, UserPlus, Wifi, WifiOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DriverCard } from "./DriverCard";
import type { Driver } from "@/types/driver.types";
import type { EnrichedPosition } from "@/types/position.types";
import { cn } from "@/lib/utils";

type DriverWithPosition = Driver & {
  position?: EnrichedPosition;
};

type StatusFilter = "all" | "moving" | "idle" | "offline";

interface FleetSidebarProps {
  drivers: DriverWithPosition[];
  selectedDriverId: string | null;
  onSelectDriver: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isConnected: boolean;
  isLoading: boolean;
}

const statusTabs: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "moving", label: "Moving" },
  { value: "idle", label: "Idle" },
  { value: "offline", label: "Offline" },
];

const getDriverStatus = (driver: DriverWithPosition): StatusFilter => {
  if (!driver.position) return "offline";
  
  const ageMs = new Date().getTime() - new Date(driver.position.time).getTime();
  const ageMinutes = ageMs / 1000 / 60;
  
  if (ageMinutes > 5) return "offline";
  if (driver.position.speed > 2) return "moving";
  return "idle";
};

export function FleetSidebar({
  drivers,
  selectedDriverId,
  onSelectDriver,
  collapsed,
  onToggleCollapse,
  isConnected,
  isLoading,
}: FleetSidebarProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const navigate = useNavigate();

  const counts = useMemo(() => ({
    all: drivers.length,
    moving: drivers.filter((d) => getDriverStatus(d) === "moving").length,
    idle: drivers.filter((d) => getDriverStatus(d) === "idle").length,
    offline: drivers.filter((d) => getDriverStatus(d) === "offline").length,
  }), [drivers]);

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      const status = getDriverStatus(d);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesSearch =
        !search ||
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.vehiclePlate && d.vehiclePlate.toLowerCase().includes(search.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [drivers, statusFilter, search]);

  if (collapsed) {
    return (
      <div className="w-12 shrink-0 bento-card flex flex-col items-center py-3 gap-2">
        <button onClick={onToggleCollapse} className="p-1.5 rounded-md hover:bg-secondary transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="w-6 h-px bg-border my-1" />
        <Badge variant="secondary" className="text-[10px] px-1.5">
          {counts.moving}
        </Badge>
        <div className="mt-auto">
          {isConnected ? (
            <Wifi className="w-3 h-3 text-green-500" />
          ) : (
            <WifiOff className="w-3 h-3 text-red-500" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 shrink-0 bento-card flex flex-col animate-fade-in">
      {/* Header */}
      <div className="p-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm">Fleet Overview</h2>
          <Badge variant="secondary" className="text-xs">
            {counts.moving} moving
          </Badge>
          {isConnected ? (
            <Badge variant="outline" className="text-xs gap-1">
              <Wifi className="w-3 h-3" />
              Live
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-xs gap-1">
              <WifiOff className="w-3 h-3" />
              Offline
            </Badge>
          )}
        </div>
        <button onClick={onToggleCollapse} className="p-1.5 rounded-md hover:bg-secondary transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Status tabs */}
      <div className="px-3 flex gap-1">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              "flex-1 text-xs py-1.5 rounded-md font-medium transition-colors",
              statusFilter === tab.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary"
            )}
          >
            {tab.label} ({counts[tab.value]})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="p-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name or plate..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-3 pb-2 flex gap-2">
        <Button size="sm" className="flex-1 h-7 text-xs gap-1" onClick={() => navigate('/routes')}>
          <Plus className="w-3 h-3" /> Create Route
        </Button>
        <Button variant="outline" size="sm" className="flex-1 h-7 text-xs gap-1">
          <UserPlus className="w-3 h-3" /> Assign
        </Button>
      </div>

      {/* Driver list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {isLoading && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
            <p>Loading drivers...</p>
          </div>
        )}
        {!isLoading && filtered.map((driver) => (
          <DriverCard
            key={driver.id}
            driver={driver}
            selected={driver.id === selectedDriverId}
            onSelect={onSelectDriver}
            status={getDriverStatus(driver)}
          />
        ))}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <p>No drivers found</p>
          </div>
        )}
      </div>
    </div>
  );
}
