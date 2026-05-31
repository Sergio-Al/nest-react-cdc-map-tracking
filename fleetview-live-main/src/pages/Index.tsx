import { DriverInbox } from "@/components/dashboard/DriverInbox";
import { MapWorkspace } from "@/components/dashboard/MapWorkspace";
import { DriverPanel, DriverPanelBody } from "@/components/dashboard/DriverPanel";
import { Footer } from "@/components/dashboard/Footer";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useSocket } from "@/hooks/useSocket";
import { useDriverPositions } from "@/hooks/useDriverPositions";
import { useDrivers, useInitialPositions } from "@/hooks/api/useDrivers";
import { useDashboardHotkeys } from "@/hooks/useDashboardHotkeys";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useMapStore } from "@/stores/map.store";

const Index = () => {
  // Shared driver selection lives in the map store so inbox, map, and the
  // detail panel all react to the same value.
  const selectedDriverId = useMapStore((state) => state.selectedDriverId);
  const selectDriver = useMapStore((state) => state.selectDriver);

  const { isConnected } = useSocket();
  useDriverPositions(isConnected);
  useDashboardHotkeys();

  const { data: drivers = [], isLoading: isLoadingDrivers } = useDrivers();
  useInitialPositions(drivers);

  const positions = useMapStore((state) => state.positions);
  const driversWithPositions = drivers.map((driver) => ({
    ...driver,
    position: positions[driver.id],
  }));

  const selected = driversWithPositions.find((d) => d.id === selectedDriverId);

  // Below xl the detail panel becomes a slide-over that opens on selection.
  const isBelowXl = useMediaQuery("(max-width: 1279px)");
  const drawerOpen = isBelowXl && !!selected;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1">
        <DriverInbox
          drivers={driversWithPositions}
          selectedDriverId={selectedDriverId}
          onSelectDriver={selectDriver}
          isLoading={isLoadingDrivers}
        />

        <MapWorkspace
          drivers={driversWithPositions}
          selectedDriverId={selectedDriverId}
          onSelectDriver={selectDriver}
        />

        <DriverPanel driver={selected} />
      </div>

      <Footer isConnected={isConnected} />

      {/* Detail slide-over for < xl */}
      <Sheet open={drawerOpen} onOpenChange={(open) => !open && selectDriver(null)}>
        <SheetContent side="right" className="w-[340px] border-mc-border bg-background p-0">
          <DriverPanelBody driver={selected} />
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Index;
