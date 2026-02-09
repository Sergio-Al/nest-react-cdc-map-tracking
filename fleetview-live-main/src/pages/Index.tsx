import { useState} from "react";
import { FleetSidebar } from "@/components/dashboard/FleetSidebar";
import { TrackingMap } from "@/components/dashboard/TrackingMap";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { useSocket } from "@/hooks/useSocket";
import { useDriverPositions } from "@/hooks/useDriverPositions";
import { useDrivers } from "@/hooks/api/useDrivers";
import { useMapStore } from "@/stores/map.store";

const Index = () => {
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Initialize WebSocket connection
  const { isConnected } = useSocket();

  // Subscribe to real-time position updates
  useDriverPositions();

  // Fetch driver metadata
  const { data: drivers = [], isLoading: isLoadingDrivers } = useDrivers();

  // Get live positions from map store
  const positions = useMapStore((state) => state.positions);
  const positionsArray = Object.values(positions);

  // Merge driver data with live positions for the sidebar
  const driversWithPositions = drivers.map((driver) => ({
    ...driver,
    position: positions[driver.id],
  }));

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="flex-1 flex min-h-0 p-3 gap-3">
        {/* Fleet Sidebar */}
        <FleetSidebar
          drivers={driversWithPositions}
          selectedDriverId={selectedDriverId}
          onSelectDriver={setSelectedDriverId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          isConnected={isConnected}
          isLoading={isLoadingDrivers}
        />

        {/* Main content - bento grid */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3 shrink-0">
            <StatsGrid drivers={driversWithPositions} />
          </div>

          {/* Map */}
          <TrackingMap
            selectedDriverId={selectedDriverId}
            onSelectDriver={setSelectedDriverId}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
