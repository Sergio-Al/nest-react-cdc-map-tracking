import { useState } from "react";
import { Navigation, Phone, Route as RouteIcon, Check, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Driver } from "@/types/driver.types";
import type { EnrichedPosition } from "@/types/position.types";
import { getDriverStatus, speedKmh, formatAge, statusColorVar } from "@/lib/driverStatus";
import type { DriverStatus } from "@/lib/driverStatus";
import {
  useDriverEvents,
  useDriverCurrentRoute,
  useDriverSpeedHistory,
  useDriverVehicle,
} from "@/hooks/api/useDriverDetail";
import type { CurrentRoute } from "@/hooks/api/useDriverDetail";
import type { EventTone, MockEvent, MockStop, MockVehicle } from "@/lib/mock/driverMock";
import { useMapStore } from "@/stores/map.store";
import { ProgressBar } from "./ProgressBar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DriverWithPosition = Driver & { position?: EnrichedPosition };
type Tab = "activity" | "stops" | "vehicle" | "notes";

const STATUS_LABEL: Record<DriverStatus, string> = {
  moving: "En route",
  idle: "Idle",
  offline: "Offline",
};

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function toneColor(tone: EventTone): string {
  if (tone === "accent") return "var(--mc-accent)";
  if (tone === "empty") return "var(--mc-bg-elev)";
  return statusColorVar(tone);
}

/* ── Presentational sections (no hooks) ───────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] uppercase tracking-[0.07em] text-mc-text-dim">{children}</div>
  );
}

function KVGrid({ driver, route }: { driver: DriverWithPosition; route: CurrentRoute | null }) {
  const distance = route ? route.summary.progress * 4 + 6 : 0;
  const items = [
    { label: "Speed", value: speedKmh(driver.position?.speed), unit: "km/h" },
    { label: "Distance", value: distance.toFixed(1), unit: "km" },
    { label: "Last ping", value: formatAge(driver.position?.time), unit: "" },
    { label: "Visits", value: route ? `${route.summary.progress}/${route.summary.total}` : "—", unit: "" },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {items.map((it) => (
        <div key={it.label}>
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-mc-text-dim">{it.label}</div>
          <div className="font-mono text-[13px] font-medium tabular-nums">
            {it.value}
            {it.unit && <span className="ml-1 text-[11px] text-mc-text-dim">{it.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function SpeedSparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex h-12 items-end gap-0.5 rounded-[6px] border border-border bg-mc-surface px-2.5 py-1.5">
      {data.map((v, i) => (
        <div
          key={i}
          title={`${v} km/h`}
          className="flex-1 rounded-[1px]"
          style={{
            height: `${Math.max(6, (v / max) * 100)}%`,
            background: "var(--mc-accent)",
            opacity: i === data.length - 1 ? 0.95 : 0.5,
          }}
        />
      ))}
    </div>
  );
}

function StopDot({ state }: { state: MockStop["state"] }) {
  if (state === "done") {
    return (
      <span
        className="flex h-[18px] w-[18px] items-center justify-center rounded-full"
        style={{ background: statusColorVar("moving") }}
      >
        <Check className="h-2.5 w-2.5 text-mc-bg" strokeWidth={3} />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span
        className="h-[18px] w-[18px] rounded-full shadow-[0_0_0_3px_var(--mc-accent-soft)]"
        style={{ background: "var(--mc-accent)" }}
      />
    );
  }
  return <span className="h-[18px] w-[18px] rounded-full border-[1.5px] border-mc-border-strong bg-background" />;
}

function StopsSection({ route }: { route: CurrentRoute }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11.5px]">
        <span className="text-muted-foreground">
          Route · <span className="text-foreground">{route.summary.routeName}</span>
        </span>
        <span className="font-mono text-mc-text-dim">
          {route.summary.progress}/{route.summary.total}
        </span>
      </div>
      <ProgressBar total={route.summary.total} progress={route.summary.progress} />

      <div className="relative pt-1">
        <span className="absolute bottom-2 left-[9px] top-2 w-px bg-border" />
        <ul className="space-y-3">
          {route.stops.map((stop, i) => (
            <li key={i} className="relative grid grid-cols-[18px_1fr_auto] items-start gap-2.5">
              <StopDot state={stop.state} />
              <div className="min-w-0">
                <div
                  className={cn(
                    "truncate text-[12.5px] font-medium",
                    stop.state === "done" && "text-muted-foreground line-through",
                  )}
                >
                  {stop.name}
                </div>
                <div className="truncate font-mono text-[10.5px] text-mc-text-dim">{stop.detail}</div>
              </div>
              <span className="font-mono text-[10.5px] text-mc-text-dim">{stop.time}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ActivitySection({ events }: { events: MockEvent[] }) {
  return (
    <div className="relative">
      <span className="absolute bottom-2 left-[7px] top-2 w-px bg-border" />
      <ul className="space-y-3.5">
        {events.map((e) => (
          <li key={e.id} className="relative grid grid-cols-[14px_1fr] gap-2.5">
            <span
              className="mt-0.5 h-3.5 w-3.5 rounded-full"
              style={
                e.tone === "empty"
                  ? { background: "var(--mc-bg-elev)", border: "1.5px solid var(--mc-border-strong)" }
                  : { background: toneColor(e.tone) }
              }
            />
            <div>
              <div className="text-[12.5px] leading-snug">
                <span className="text-muted-foreground">{e.label}</span>{" "}
                {e.subject && (
                  <span
                    className={e.tone === "accent" ? "font-medium" : "text-foreground"}
                    style={e.tone === "accent" ? { color: "var(--mc-accent)" } : undefined}
                  >
                    {e.subject}
                  </span>
                )}
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-mc-text-dim">{e.time}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VehicleSection({ vehicle, plate }: { vehicle: MockVehicle; plate: string | null }) {
  const rows: [string, string][] = [
    ["Make / model", `${vehicle.make} ${vehicle.model}`],
    ["Year", String(vehicle.year)],
    ["Plate", plate ?? "—"],
    ["Odometer", `${vehicle.odometerKm.toLocaleString()} km`],
    ["Last service", vehicle.lastService],
  ];
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-[11.5px]">
          <span className="text-muted-foreground">Fuel</span>
          <span className="font-mono text-mc-text-dim">{vehicle.fuelPct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-pill bg-mc-surface-hi">
          <div className="h-full rounded-pill bg-mc-accent" style={{ width: `${vehicle.fuelPct}%` }} />
        </div>
      </div>
      <dl className="divide-y divide-border/40">
        {rows.map(([k, val]) => (
          <div key={k} className="flex items-center justify-between py-2 text-[12.5px]">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-mono text-mc-text">{val}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function NotesSection() {
  const [notes, setNotes] = useState("");
  return (
    <div className="space-y-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add a note for this driver…"
        className="h-32 w-full resize-none rounded-[6px] border border-border bg-mc-surface p-2.5 text-[12.5px] outline-none placeholder:text-mc-text-dim focus:border-mc-accent-border"
      />
      <p className="text-[10.5px] text-mc-text-dim">Notes are local-only until the backend is wired.</p>
    </div>
  );
}

/* ── Panel ────────────────────────────────────────────────── */

const TABS: { key: Tab; label: string }[] = [
  { key: "activity", label: "Activity" },
  { key: "stops", label: "Stops" },
  { key: "vehicle", label: "Vehicle" },
  { key: "notes", label: "Notes" },
];

function PanelContent({ driver }: { driver: DriverWithPosition }) {
  const [tab, setTab] = useState<Tab>("activity");
  const navigate = useNavigate();
  const setFollowDriver = useMapStore((s) => s.setFollowDriver);

  // All detail data fetched up-front (unconditionally) to satisfy the Rules of Hooks.
  const route = useDriverCurrentRoute(driver.id);
  const events = useDriverEvents(driver.id, driver.vehiclePlate);
  const speed = useDriverSpeedHistory(driver.id);
  const vehicle = useDriverVehicle(driver.id);

  const status = getDriverStatus(driver.position);
  const color = statusColorVar(status);

  const call = () => {
    if (driver.phone) window.location.href = `tel:${driver.phone}`;
    else toast.info("No phone number on file for this driver.");
  };

  const counts: Partial<Record<Tab, number>> = {
    activity: events.length,
    stops: route?.summary.total,
  };

  return (
    <div className="flex h-full w-full flex-col">
      {/* Head */}
      <div className="border-b border-border px-4 pb-3 pt-3.5">
        <div className="flex items-start gap-2.5">
          <span
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border-2 font-mono text-[13px] font-bold"
            style={{ borderColor: color, color, background: `color-mix(in oklch, ${color} 18%, transparent)` }}
          >
            {initials(driver.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{driver.name}</div>
            <div className="truncate font-mono text-[11.5px] text-muted-foreground">
              {driver.vehiclePlate ?? "—"}
              {route && ` · ${route.summary.routeName}`}
            </div>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2 py-0.5 font-mono text-[10.5px]"
            style={{ color, background: `color-mix(in oklch, ${color} 16%, transparent)` }}
          >
            <span className="h-[5px] w-[5px] rounded-full" style={{ background: color }} />
            {STATUS_LABEL[status]}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <Button size="sm" className="h-[26px] gap-1 text-[11.5px]" onClick={() => setFollowDriver(true)}>
            <Navigation className="h-3.5 w-3.5" /> Track
          </Button>
          <Button variant="outline" size="sm" className="h-[26px] gap-1 text-[11.5px]" onClick={call}>
            <Phone className="h-3.5 w-3.5" /> Call
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-[26px] gap-1 text-[11.5px]"
            onClick={() => navigate("/routes")}
          >
            <RouteIcon className="h-3.5 w-3.5" /> Route
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border px-3">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = counts[t.key];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "relative flex items-center gap-1.5 px-2.5 py-2.5 text-xs font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {count != null && (
                <span
                  className={cn(
                    "rounded px-1 font-mono text-[10.5px]",
                    active ? "bg-mc-accent-soft text-mc-accent" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              )}
              {active && <span className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-full bg-mc-accent" />}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 space-y-[18px] overflow-y-auto px-4 pb-[18px] pt-3.5">
        {tab === "activity" && (
          <>
            <KVGrid driver={driver} route={route} />
            <div>
              <SectionLabel>Speed · last 60 min</SectionLabel>
              <SpeedSparkline data={speed} />
            </div>
            <div>
              <SectionLabel>Activity</SectionLabel>
              <ActivitySection events={events} />
            </div>
          </>
        )}
        {tab === "stops" && route && <StopsSection route={route} />}
        {tab === "vehicle" && vehicle && <VehicleSection vehicle={vehicle} plate={driver.vehiclePlate} />}
        {tab === "notes" && <NotesSection />}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-mc-surface">
        <Users className="h-5 w-5 text-mc-text-dim" />
      </div>
      <p className="text-sm font-medium">No driver selected</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Select a driver from the inbox to see live details, route stops, and activity.
      </p>
    </div>
  );
}

/** Panel content without the framing — used by the inline aside and the mobile drawer. */
export function DriverPanelBody({ driver }: { driver?: DriverWithPosition }) {
  return driver ? <PanelContent driver={driver} /> : <EmptyState />;
}

/** Inline detail panel (≥ xl). Below xl, Index renders a slide-over drawer instead. */
export function DriverPanel({ driver }: { driver?: DriverWithPosition }) {
  return (
    <aside className="hidden h-full w-[340px] shrink-0 flex-col border-l border-border bg-background xl:flex">
      <DriverPanelBody driver={driver} />
    </aside>
  );
}
