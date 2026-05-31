import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Filter, Plus, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Driver } from "@/types/driver.types";
import type { EnrichedPosition } from "@/types/position.types";
import { getDriverStatus, formatAge, statusColorVar } from "@/lib/driverStatus";
import type { DriverStatus } from "@/lib/driverStatus";
import { getMockRouteSummary } from "@/lib/mock/driverMock";
import { useDashboardStore } from "@/stores/dashboard.store";
import { isTypingTarget } from "@/lib/dom";
import { cn } from "@/lib/utils";

type DriverWithPosition = Driver & { position?: EnrichedPosition };
type StatusFilter = "all" | "moving" | "idle";
type SortKey = "speed" | "last_seen" | "name";

const SORT_CYCLE: SortKey[] = ["speed", "last_seen", "name"];

interface DriverInboxProps {
  drivers: DriverWithPosition[];
  selectedDriverId: string | null;
  onSelectDriver: (id: string) => void;
  isLoading: boolean;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function FilterChip({
  label,
  count,
  active,
  dotStatus,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dotStatus?: DriverStatus;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-pill border px-2.5 text-[11.5px] font-medium transition-colors",
        active
          ? "border-mc-accent-border bg-mc-accent-soft text-mc-accent"
          : "border-border text-muted-foreground hover:bg-secondary",
      )}
    >
      {dotStatus && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: statusColorVar(dotStatus) }}
        />
      )}
      {label}
      <span className="font-mono text-[10.5px] opacity-80">{count}</span>
    </button>
  );
}

function InboxRow({
  driver,
  selected,
  onSelect,
}: {
  driver: DriverWithPosition;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const status = getDriverStatus(driver.position);
  const color = statusColorVar(status);
  const route = getMockRouteSummary(driver.id);
  const pct = Math.round((route.progress / route.total) * 100);

  const snippet =
    status === "offline"
      ? driver.position
        ? t("inbox.lastSeen", { age: formatAge(driver.position.time) })
        : t("inbox.noSignal")
      : t("inbox.stopsProgress", {
          routeName: route.routeName,
          progress: route.progress,
          total: route.total,
        });

  return (
    <button
      type="button"
      onClick={onSelect}
      data-driver-id={driver.id}
      className={cn(
        "grid w-full grid-cols-[36px_1fr_auto] items-center gap-2.5 border-l-2 border-l-transparent py-[11px] pl-3.5 pr-4 text-left transition-colors",
        selected ? "border-l-mc-accent bg-secondary" : "hover:bg-secondary",
        status === "offline" && "opacity-[0.55]",
      )}
    >
      {/* Avatar */}
      <div className="relative h-9 w-9 shrink-0">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 font-mono text-[12px] font-bold"
          style={{ borderColor: color, color, background: `color-mix(in oklch, ${color} 18%, transparent)` }}
        >
          {initials(driver.name)}
        </div>
        <span
          className="absolute -bottom-0.5 -right-0.5 h-[11px] w-[11px] rounded-full border-2 border-background"
          style={{ background: color }}
        />
      </div>

      {/* Main */}
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">{driver.name}</div>
        <div className="truncate text-[11.5px] text-muted-foreground">{snippet}</div>
      </div>

      {/* Meta */}
      <div className="flex flex-col items-end gap-1">
        <span className="font-mono text-[10.5px] text-mc-text-dim">
          {formatAge(driver.position?.time)}
        </span>
        {pct >= 90 ? (
          <span
            className="rounded-pill px-1.5 py-px text-[10px] font-medium"
            style={{
              color: statusColorVar("moving"),
              background: `color-mix(in oklch, ${statusColorVar("moving")} 16%, transparent)`,
            }}
          >
            {pct}%
          </span>
        ) : status === "idle" ? (
          <span
            className="rounded-pill px-1.5 py-px text-[10px] font-medium"
            style={{
              color: statusColorVar("idle"),
              background: `color-mix(in oklch, ${statusColorVar("idle")} 16%, transparent)`,
            }}
          >
            {t("inbox.idleBadge")}
          </span>
        ) : null}
      </div>
    </button>
  );
}

export function DriverInbox({
  drivers,
  selectedDriverId,
  onSelectDriver,
  isLoading,
}: DriverInboxProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>(
    () => (localStorage.getItem("fleet.inboxSort") as SortKey) || "speed",
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inboxSheetOpen = useDashboardStore((s) => s.inboxSheetOpen);
  const setInboxSheetOpen = useDashboardStore((s) => s.setInboxSheetOpen);
  const { t } = useTranslation("dashboard");

  useEffect(() => {
    localStorage.setItem("fleet.inboxSort", sort);
  }, [sort]);

  // Global "/" focuses the search input (when not already typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the selected row scrolled into view (covers map-pin clicks + ↑↓ nav).
  useEffect(() => {
    if (!selectedDriverId || !listRef.current) return;
    listRef.current
      .querySelector(`[data-driver-id="${selectedDriverId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedDriverId]);

  const counts = useMemo(
    () => ({
      all: drivers.length,
      moving: drivers.filter((d) => getDriverStatus(d.position) === "moving").length,
      idle: drivers.filter((d) => getDriverStatus(d.position) === "idle").length,
    }),
    [drivers],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = drivers.filter((d) => {
      const status = getDriverStatus(d.position);
      const matchesFilter = filter === "all" || status === filter;
      const matchesSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        (d.vehiclePlate?.toLowerCase().includes(q) ?? false);
      return matchesFilter && matchesSearch;
    });

    const byTime = (d: DriverWithPosition) =>
      d.position ? new Date(d.position.time).getTime() : 0;

    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "last_seen") return byTime(b) - byTime(a);
      return (b.position?.speed ?? 0) - (a.position?.speed ?? 0); // speed
    });
  }, [drivers, filter, search, sort]);

  const cycleSort = () =>
    setSort((s) => SORT_CYCLE[(SORT_CYCLE.indexOf(s) + 1) % SORT_CYCLE.length]);

  const select = (id: string) => {
    onSelectDriver(id);
    setInboxSheetOpen(false); // close the drawer on selection (no-op on lg+)
  };

  // ↑/↓ move the selection through the visible list (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      if (visible.length === 0) return;
      e.preventDefault();
      const idx = visible.findIndex((d) => d.id === selectedDriverId);
      const next =
        e.key === "ArrowDown"
          ? Math.min(idx < 0 ? 0 : idx + 1, visible.length - 1)
          : Math.max(idx < 0 ? 0 : idx - 1, 0);
      onSelectDriver(visible[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedDriverId, onSelectDriver]);

  return (
    <>
      {inboxSheetOpen && (
        <div
          className="fixed inset-0 left-14 z-[1090] bg-black/40 lg:hidden"
          onClick={() => setInboxSheetOpen(false)}
        />
      )}
      <aside
        className={cn(
          "flex h-full w-[340px] shrink-0 flex-col border-r border-border bg-background",
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-14 max-lg:z-[1100] max-lg:shadow-2xl max-lg:transition-transform",
          inboxSheetOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-[120%]",
        )}
      >
      {/* Header */}
      <div className="border-b border-border px-4 pb-2.5 pt-3.5">
        <div className="mb-2.5 flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-[-0.01em]">{t("inbox.fleet")}</h2>
          <span className="rounded-pill border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {counts.all}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label={t("inbox.filter")}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={t("inbox.addDriver")}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("inbox.searchPlaceholder")}
            className="h-[30px] w-full rounded-[7px] border border-border bg-background pl-8 pr-8 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-mc-accent-border"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-mc-elev px-1.5 font-mono text-[10.5px] text-muted-foreground">
            /
          </kbd>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-2">
        <FilterChip label={t("inbox.filters.all")} count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
        <FilterChip
          label={t("inbox.filters.moving")}
          count={counts.moving}
          active={filter === "moving"}
          dotStatus="moving"
          onClick={() => setFilter("moving")}
        />
        <FilterChip
          label={t("inbox.filters.idle")}
          count={counts.idle}
          active={filter === "idle"}
          dotStatus="idle"
          onClick={() => setFilter("idle")}
        />
        <button
          type="button"
          onClick={cycleSort}
          className="ml-auto inline-flex h-6 items-center gap-1 rounded-pill border border-border px-2.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
        >
          {t(`inbox.sort.${sort}`)}
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* List */}
      <div ref={listRef} className="flex-1 divide-y divide-border/40 overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-4 py-[11px]">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-secondary" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-2/3 animate-pulse rounded bg-secondary" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-secondary" />
              </div>
            </div>
          ))
        ) : visible.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("inbox.noResults")}
          </div>
        ) : (
          visible.map((driver) => (
            <InboxRow
              key={driver.id}
              driver={driver}
              selected={driver.id === selectedDriverId}
              onSelect={() => select(driver.id)}
            />
          ))
        )}
      </div>
      </aside>
    </>
  );
}
