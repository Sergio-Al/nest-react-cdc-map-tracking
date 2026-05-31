import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { Moon, Sun, Plus, Users, Navigation } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuthStore } from "@/stores/auth.store";
import { useDashboardStore } from "@/stores/dashboard.store";
import { useMapStore } from "@/stores/map.store";
import { useDrivers } from "@/hooks/api/useDrivers";
import { getMockRouteSummary } from "@/lib/mock/driverMock";
import { navItems, canSee } from "./nav";

/**
 * App-wide ⌘K command palette. Opens on ⌘K / Ctrl+K / ⌘/ (or via the store, e.g.
 * the workspace-head trigger). Groups: Drivers (searchable), Actions, Navigate.
 */
export function CommandPalette() {
  const open = useDashboardStore((s) => s.commandOpen);
  const setOpen = useDashboardStore((s) => s.setCommandOpen);
  const toggle = useDashboardStore((s) => s.toggleCommand);
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const { data: drivers = [] } = useDrivers();
  const selectDriver = useMapStore((s) => s.selectDriver);
  const focusSelected = useMapStore((s) => s.focusSelected);
  const selectedDriverId = useMapStore((s) => s.selectedDriverId);
  const selectedDriver = drivers.find((d) => d.id === selectedDriverId);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key.toLowerCase() === "k" || e.key === "/") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const openDriver = (id: string) =>
    run(() => {
      selectDriver(id);
      navigate("/");
    });

  const canCreateRoute = canSee(
    { to: "/routes", label: "Routes", icon: Plus, roles: ["admin", "dispatcher"], group: "primary" },
    role,
  );
  const visibleNav = navItems.filter((item) => canSee(item, role));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search drivers or type a command…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {drivers.length > 0 && (
          <CommandGroup heading="Drivers">
            {drivers.map((d) => (
              <CommandItem
                key={d.id}
                value={`${d.name} ${d.vehiclePlate ?? ""}`}
                onSelect={() => openDriver(d.id)}
              >
                <Users className="mr-2 h-4 w-4 text-mc-text-dim" />
                <span>{d.name}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {d.vehiclePlate ?? "—"} · {getMockRouteSummary(d.id).routeName}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Actions">
          {canCreateRoute && (
            <CommandItem value="create new route" onSelect={() => run(() => navigate("/routes"))}>
              <Plus className="mr-2 h-4 w-4" />
              <span>Create new route</span>
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
          )}
          {selectedDriver && (
            <CommandItem
              value={`focus ${selectedDriver.name} on map`}
              onSelect={() => run(() => { navigate("/"); focusSelected(); })}
            >
              <Navigation className="mr-2 h-4 w-4" />
              <span>Focus on {selectedDriver.name} on map</span>
              <CommandShortcut>F</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem
            value="toggle theme dark light mode"
            onSelect={() => run(() => setTheme(isDark ? "light" : "dark"))}
          >
            {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            <span>{isDark ? "Switch to light theme" : "Switch to dark theme"}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          {visibleNav.map((item) => (
            <CommandItem
              key={item.to}
              value={`go ${item.label}`}
              onSelect={() => run(() => navigate(item.to))}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
