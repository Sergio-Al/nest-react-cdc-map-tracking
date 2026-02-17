import { Search, Bell, Truck, ChevronDown, User, LogOut, History, MapPin, Activity, Route } from "lucide-react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/auth.store";
import { toast } from "sonner";

export function DashboardHeader() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Logout failed');
    }
  };

  const getRoleDisplay = (role: string) => {
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  return (
    <header className="h-16 shrink-0 border-b border-border/50 bg-card px-4 flex items-center justify-between gap-4 sticky top-0 z-50">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Truck className="w-4.5 h-4.5 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold tracking-tight hidden sm:block">
          FleetTrack
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex items-center gap-1 ml-4">
        <Link
          to="/"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            pathname === '/'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          <MapPin className="h-3.5 w-3.5" />
          Live
        </Link>
        <Link
          to="/history"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            pathname === '/history'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          <History className="h-3.5 w-3.5" />
          History
        </Link>
        {(user?.role === 'admin' || user?.role === 'dispatcher') && (
          <Link
            to="/routes"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname === '/routes'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            <Route className="h-3.5 w-3.5" />
            Routes
          </Link>
        )}
        {user?.role === 'admin' && (
          <Link
            to="/monitoring"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname === '/monitoring'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            Monitoring
          </Link>
        )}
      </nav>

      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search drivers, routes, customers..."
            className="pl-9 h-9 bg-secondary/50 border-transparent focus:border-primary/30 focus:bg-card"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4.5 h-4.5" />
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            3
          </span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 pl-2 border-l border-border/50">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="hidden md:block text-sm text-left">
                <p className="font-medium leading-none">{user?.name || 'User'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {user?.role ? getRoleDisplay(user.role) : 'User'}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
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
    </header>
  );
}
