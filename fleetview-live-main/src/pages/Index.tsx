import { useMemo } from "react";
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
import { useDatasetFilters } from "@/components/filters/useDatasetFilters";
import { DRIVER_FIELDS, DRIVER_VIEWS } from "@/components/reports/reportFilters";

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

  // Advanced fleet filters (status / vehicle type / assignment / device + saved
  // views). The narrowed set drives the inbox list and the map markers; the
  // popover control lives in the MapWorkspace top bar.
  const ds = useDatasetFilters(
    "fleet-dashboard",
    driversWithPositions,
    DRIVER_FIELDS,
    DRIVER_VIEWS,
  );
  const visibleDriverIds = useMemo(
    () => new Set(ds.filtered.map((d) => d.id)),
    [ds.filtered],
  );

  const selected = driversWithPositions.find((d) => d.id === selectedDriverId);

  // Below xl the detail panel becomes a slide-over that opens on selection.
  const isBelowXl = useMediaQuery("(max-width: 1279px)");
  const drawerOpen = isBelowXl && !!selected;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1">
        <DriverInbox
          drivers={ds.filtered}
          selectedDriverId={selectedDriverId}
          onSelectDriver={selectDriver}
          isLoading={isLoadingDrivers}
        />

        <MapWorkspace
          drivers={driversWithPositions}
          visibleDriverIds={visibleDriverIds}
          selectedDriverId={selectedDriverId}
          onSelectDriver={selectDriver}
          filters={ds.filters}
          onChangeFilters={ds.updateFilters}
          views={ds.views}
          activeViewId={ds.activeViewId}
          onSelectView={ds.selectView}
          onSaveView={ds.saveView}
          onDeleteView={ds.deleteView}
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
