import {
  MapPin,
  History,
  Route,
  Users,
  Truck,
  Building2,
  Activity,
  FileBarChart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** If set, only these roles see the item. Undefined = everyone. */
  roles?: string[];
  group: "primary" | "secondary";
}

/** Global navigation shared by the icon rail and the ⌘K palette. */
export const navItems: NavItem[] = [
  { to: "/", label: "Live", icon: MapPin, group: "primary" },
  { to: "/history", label: "History", icon: History, group: "primary" },
  { to: "/routes", label: "Routes", icon: Route, roles: ["admin", "dispatcher"], group: "primary" },
  { to: "/drivers", label: "Drivers", icon: Users, roles: ["admin", "dispatcher"], group: "primary" },
  { to: "/vehicles", label: "Vehicles", icon: Truck, roles: ["admin", "dispatcher"], group: "primary" },
  { to: "/customers", label: "Customers", icon: Building2, roles: ["admin", "dispatcher"], group: "primary" },
  { to: "/monitoring", label: "Monitoring", icon: Activity, roles: ["admin"], group: "secondary" },
  { to: "/reports", label: "Reports", icon: FileBarChart, roles: ["admin", "dispatcher"], group: "secondary" },
];

export const canSee = (item: NavItem, role?: string | null): boolean =>
  !item.roles || (!!role && item.roles.includes(role));

/** True when `pathname` is the active route for `to` ("/" matches exactly). */
export const isActiveRoute = (pathname: string, to: string): boolean =>
  to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
