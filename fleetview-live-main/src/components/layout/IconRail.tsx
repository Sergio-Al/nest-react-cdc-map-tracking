import { Truck, Bell, LogOut } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/auth.store";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/utils";
import { navItems, canSee, isActiveRoute } from "./nav";
import type { NavItem } from "./nav";
import { toast } from "sonner";

function initials(name?: string | null): string {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function RailButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-[7px] transition-colors",
            active
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          {active && (
            <span className="absolute -left-2.5 top-1.5 bottom-1.5 w-0.5 rounded-full bg-mc-accent" />
          )}
          <item.icon className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function IconRail() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();

  const primary = navItems.filter((i) => i.group === "primary" && canSee(i, user?.role));
  const secondary = navItems.filter((i) => i.group === "secondary" && canSee(i, user?.role));

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Logged out successfully");
      navigate("/login");
    } catch {
      toast.error("Logout failed");
    }
  };

  return (
    <aside className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-2.5">
      {/* Logo mark */}
      <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-mc bg-gradient-to-br from-mc-accent to-mc-accent-strong shadow-[inset_0_1px_0_oklch(1_0_0/0.25)] ring-1 ring-mc-accent-border">
        <Truck className="h-4 w-4 text-white" />
      </div>

      {/* Primary nav */}
      {primary.map((item) => (
        <RailButton
          key={item.to}
          item={item}
          active={isActiveRoute(pathname, item.to)}
          onClick={() => navigate(item.to)}
        />
      ))}

      {secondary.length > 0 && <div className="my-2 h-px w-6 bg-border" />}

      {/* Secondary nav */}
      {secondary.map((item) => (
        <RailButton
          key={item.to}
          item={item}
          active={isActiveRoute(pathname, item.to)}
          onClick={() => navigate(item.to)}
        />
      ))}

      {/* Bottom group */}
      <div className="mt-auto flex flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-mc-accent ring-2 ring-background" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Notifications</TooltipContent>
        </Tooltip>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-mc-accent-soft font-mono text-[11px] font-bold text-mc-accent"
            >
              {initials(user?.name)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56">
            <DropdownMenuLabel>{user?.name || "My Account"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <span className="text-xs text-muted-foreground">{user?.email}</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <span className="text-xs text-muted-foreground">Tenant: {user?.tenantId}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
