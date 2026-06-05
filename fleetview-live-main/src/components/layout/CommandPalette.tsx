import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
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
import { navItems, canSee, hasFeature } from "./nav";
import { useEntitlements } from "@/hooks/api/useEntitlements";

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
  const { t } = useTranslation("nav");

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

  const { data: entitlements } = useEntitlements();
  const features = entitlements?.features;

  const canCreateRoute = canSee({ roles: ["admin", "dispatcher"] }, role);
  const visibleNav = navItems.filter(
    (item) => canSee(item, role) && hasFeature(item, features),
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t("palette.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("palette.empty")}</CommandEmpty>

        {drivers.length > 0 && (
          <CommandGroup heading={t("palette.groups.drivers")}>
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

        <CommandGroup heading={t("palette.groups.actions")}>
          {canCreateRoute && (
            <CommandItem value="create new route" onSelect={() => run(() => navigate("/routes"))}>
              <Plus className="mr-2 h-4 w-4" />
              <span>{t("palette.actions.createRoute")}</span>
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
          )}
          {selectedDriver && (
            <CommandItem
              value={`focus ${selectedDriver.name} on map`}
              onSelect={() => run(() => { navigate("/"); focusSelected(); })}
            >
              <Navigation className="mr-2 h-4 w-4" />
              <span>{t("palette.actions.focusDriver", { name: selectedDriver.name })}</span>
              <CommandShortcut>F</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem
            value="toggle theme dark light mode"
            onSelect={() => run(() => setTheme(isDark ? "light" : "dark"))}
          >
            {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            <span>{isDark ? t("palette.actions.switchToLight") : t("palette.actions.switchToDark")}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t("palette.groups.navigate")}>
          {visibleNav.map((item) => {
            const label = t(item.labelKey);
            return (
              <CommandItem
                key={item.to}
                value={`go ${label}`}
                onSelect={() => run(() => navigate(item.to))}
              >
                <item.icon className="mr-2 h-4 w-4" />
                <span>{label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
