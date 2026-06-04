import type { ReactNode } from "react";
import { Search, Plus, PanelLeftOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Driver } from "@/types/driver.types";
import type { EnrichedPosition } from "@/types/position.types";
import { TrackingMap } from "./TrackingMap";
import { FleetFilters } from "./FleetFilters";
import { getDriverStatus, statusColorVar } from "@/lib/driverStatus";
import { getFleetStats } from "@/lib/mock/driverMock";
import type { FleetStats } from "@/lib/mock/driverMock";
import { useDashboardStore } from "@/stores/dashboard.store";
import { Button } from "@/components/ui/button";
import type { ActiveFilter } from "@/components/filters/types";
import type { ViewWithCount } from "@/components/filters/useDatasetFilters";

type DriverWithPosition = Driver & { position?: EnrichedPosition };

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function WorkspaceHead({
  onOpenCommand,
  onNewRoute,
  onOpenInbox,
  filtersSlot,
}: {
  onOpenCommand: () => void;
  onNewRoute: () => void;
  onOpenInbox: () => void;
  filtersSlot: ReactNode;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border px-3.5">
      <button
        type="button"
        aria-label={t("workspace.openInbox")}
        onClick={onOpenInbox}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
      >
        <PanelLeftOpen className="h-4 w-4" />
      </button>
      <nav className="flex items-center gap-1.5 text-[13px]">
        <span className="text-muted-foreground">{t("workspace.fleet")}</span>
        <span className="text-mc-text-dim">/</span>
        <span className="font-medium">{t("workspace.liveOps")}</span>
      </nav>
      <span className="font-mono text-[11.5px] text-muted-foreground">· {t("city")}</span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenCommand}
          className="hidden h-7 w-[260px] items-center gap-2 rounded-[7px] border border-border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:border-mc-border-strong lg:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">{t("workspace.quickSearch")}</span>
          <kbd className="rounded border border-border bg-mc-elev px-1.5 font-mono text-[10.5px]">⌘K</kbd>
        </button>
        {filtersSlot}
        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={onNewRoute}>
          <Plus className="h-3.5 w-3.5" />
          {t("workspace.newRoute")}
        </Button>
      </div>
    </div>
  );
}

function NowTrackingChip({ driver }: { driver?: DriverWithPosition }) {
  const { t } = useTranslation("dashboard");
  if (!driver) return null;
  const color = statusColorVar(getDriverStatus(driver.position));

  return (
    <div className="absolute left-1/2 top-14 z-[1000] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-pill border border-mc-border-strong bg-mc-elev py-1.5 pl-1.5 pr-3.5 shadow-mc-float">
        <span
          className="flex h-[22px] w-[22px] items-center justify-center rounded-full border font-mono text-[10px] font-bold"
          style={{ borderColor: color, color, background: `color-mix(in oklch, ${color} 18%, transparent)` }}
        >
          {initials(driver.name)}
        </span>
        <span className="h-1.5 w-1.5 rounded-full animate-livepulse" style={{ background: color }} />
        <span className="text-[11px] text-muted-foreground">{t("workspace.nowTracking")}</span>
        <span className="text-[12px] font-medium">{driver.name}</span>
        {driver.vehiclePlate && (
          <span className="font-mono text-[11px] text-mc-text-dim">· {driver.vehiclePlate}</span>
        )}
      </div>
    </div>
  );
}

function MiniStatsCard({ stats }: { stats: FleetStats }) {
  const { t } = useTranslation("dashboard");
  const cells: { label: string; value: string | number; unit?: string }[] = [
    { label: t("stats.active"), value: `${stats.activeMoving}/${stats.activeTotal}` },
    { label: t("stats.avgSpeed"), value: stats.avgSpeedKmh, unit: t("stats.units.kmh") },
    { label: t("stats.visits"), value: stats.visitsToday, unit: t("stats.units.today") },
    { label: t("stats.distance"), value: stats.distanceKm, unit: t("stats.units.km") },
    { label: t("stats.onTime"), value: `${stats.onTimePct}%` },
  ];

  return (
    <div className="absolute bottom-3.5 left-3.5 z-[1000] flex overflow-hidden rounded-mc border border-border bg-mc-elev shadow-mc-card">
      {cells.map((c, i) => (
        <div key={c.label} className={i > 0 ? "min-w-[88px] border-l border-border px-3.5 py-2" : "min-w-[88px] px-3.5 py-2"}>
          <div className="text-[9.5px] uppercase tracking-[0.07em] text-mc-text-dim">{c.label}</div>
          <div className="font-mono text-[14px] font-bold tabular-nums">
            {c.value}
            {c.unit && <span className="ml-1 text-[10px] font-normal text-mc-text-dim">{c.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

interface MapWorkspaceProps {
  /** Full fleet — used for stats and to derive filter options/counts. */
  drivers: DriverWithPosition[];
  /** IDs that pass the active fleet filters; map markers are limited to these. */
  visibleDriverIds: Set<string>;
  selectedDriverId: string | null;
  onSelectDriver: (id: string) => void;
  filters: ActiveFilter[];
  onChangeFilters: (filters: ActiveFilter[]) => void;
  views: ViewWithCount[];
  activeViewId: string;
  onSelectView: (id: string) => void;
  onSaveView: (name: string) => void;
  onDeleteView: (id: string) => void;
}

export function MapWorkspace({
  drivers,
  visibleDriverIds,
  selectedDriverId,
  onSelectDriver,
  filters,
  onChangeFilters,
  views,
  activeViewId,
  onSelectView,
  onSaveView,
  onDeleteView,
}: MapWorkspaceProps) {
  const navigate = useNavigate();
  const setCommandOpen = useDashboardStore((s) => s.setCommandOpen);
  const setInboxSheetOpen = useDashboardStore((s) => s.setInboxSheetOpen);
  const selected = drivers.find((d) => d.id === selectedDriverId);
  const stats = getFleetStats(drivers);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <WorkspaceHead
        onOpenCommand={() => setCommandOpen(true)}
        onNewRoute={() => navigate("/routes")}
        onOpenInbox={() => setInboxSheetOpen(true)}
        filtersSlot={
          <FleetFilters
            rows={drivers}
            filters={filters}
            onChange={onChangeFilters}
            views={views}
            activeViewId={activeViewId}
            onSelectView={onSelectView}
            onSaveView={onSaveView}
            onDeleteView={onDeleteView}
          />
        }
      />
      {/* `isolate` contains Leaflet's + the chrome's high z-indices in their own
          stacking context, so modals (⌘K palette, detail drawer) render above the map. */}
      <div className="relative isolate min-h-0 flex-1">
        <TrackingMap
          selectedDriverId={selectedDriverId}
          onSelectDriver={onSelectDriver}
          visibleDriverIds={visibleDriverIds}
        />
        <NowTrackingChip driver={selected} />
        <MiniStatsCard stats={stats} />
      </div>
    </div>
  );
}
