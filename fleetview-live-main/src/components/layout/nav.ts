import {
  MapPin,
  History,
  Route,
  Users,
  Truck,
  Building2,
  ShoppingCart,
  Activity,
  FileBarChart,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  /** i18n key under the `nav` namespace (e.g. "live" → `t("nav:live")`). */
  labelKey: string;
  icon: LucideIcon;
  /** If set, only these roles see the item. Undefined = everyone. */
  roles?: string[];
  group: "primary" | "secondary";
  /** If set, the tenant must have this feature gate to see the item. Undefined = everyone. */
  feature?: string;
}

/** Global navigation shared by the icon rail and the ⌘K palette. */
export const navItems: NavItem[] = [
  { to: "/", labelKey: "live", icon: MapPin, group: "primary" },
  { to: "/history", labelKey: "history", icon: History, group: "primary" },
  { to: "/routes", labelKey: "routes", icon: Route, roles: ["admin", "dispatcher"], group: "primary" },
  { to: "/drivers", labelKey: "drivers", icon: Users, roles: ["admin", "dispatcher"], group: "primary" },
  { to: "/vehicles", labelKey: "vehicles", icon: Truck, roles: ["admin", "dispatcher"], group: "primary" },
  { to: "/customers", labelKey: "customers", icon: Building2, roles: ["admin", "dispatcher"], group: "primary" },
  { to: "/orders", labelKey: "orders", icon: ShoppingCart, roles: ["admin", "dispatcher"], group: "primary" },
  { to: "/monitoring", labelKey: "monitoring", icon: Activity, roles: ["admin"], group: "secondary" },
  { to: "/reports", labelKey: "reports", icon: FileBarChart, roles: ["admin", "dispatcher"], feature: "reports", group: "secondary" },
  { to: "/settings", labelKey: "settings", icon: Settings, group: "secondary" },
];

export const canSee = (item: Pick<NavItem, "roles">, role?: string | null): boolean =>
  !item.roles || (!!role && item.roles.includes(role));

/**
 * Returns true when the tenant's loaded features include this item's feature gate,
 * or when the item has no gate. Pass `undefined` (while loading) to keep items
 * visible until entitlements are known.
 */
export const hasFeature = (
  item: Pick<NavItem, "feature">,
  features: string[] | undefined,
): boolean => !item.feature || features === undefined || features.includes(item.feature);

/** True when `pathname` is the active route for `to` ("/" matches exactly). */
export const isActiveRoute = (pathname: string, to: string): boolean =>
  to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
