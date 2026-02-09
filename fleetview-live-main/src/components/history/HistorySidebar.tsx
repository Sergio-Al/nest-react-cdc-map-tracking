import { useState } from 'react';
import {
  History,
  Search,
  Route as RouteIcon,
  UserRound,
  Calendar,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useDrivers } from '@/hooks/api/useDrivers';
import { useRoutes } from '@/hooks/api/useRoutes';
import { usePlaybackStore } from '@/stores/playback.store';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

export function HistorySidebar() {
  const {
    mode,
    selectedDriverId,
    selectedRouteId,
    dateFrom,
    dateTo,
    positions,
    setMode,
    setSelectedDriverId,
    setSelectedRouteId,
    setDateRange,
  } = usePlaybackStore();

  const { data: drivers = [], isLoading: driversLoading } = useDrivers();
  const { data: routes = [], isLoading: routesLoading } = useRoutes();

  // Default date range: today
  const [localFrom, setLocalFrom] = useState(
    dateFrom ?? format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"),
  );
  const [localTo, setLocalTo] = useState(
    dateTo ?? format(endOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"),
  );

  const handleSearch = () => {
    const from = new Date(localFrom).toISOString();
    const to = new Date(localTo).toISOString();
    setDateRange(from, to);
  };

  const handleQuickRange = (days: number) => {
    const now = new Date();
    const from = startOfDay(subDays(now, days));
    const to = endOfDay(now);
    setLocalFrom(format(from, "yyyy-MM-dd'T'HH:mm"));
    setLocalTo(format(to, "yyyy-MM-dd'T'HH:mm"));
  };

  const canSearch =
    (mode === 'driver' ? !!selectedDriverId : !!selectedRouteId) &&
    !!localFrom &&
    !!localTo;

  return (
    <div className="w-80 shrink-0 bg-card rounded-lg border border-border/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center gap-2 mb-1">
          <History className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-sm">Route History</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Play back historical route and driver positions
        </p>
      </div>

      {/* Form */}
      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* Mode selector */}
        <div className="space-y-1.5">
          <Label className="text-xs">Search by</Label>
          <Select value={mode} onValueChange={(v: 'driver' | 'route') => setMode(v)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="driver">
                <div className="flex items-center gap-2">
                  <UserRound className="h-3.5 w-3.5" />
                  Driver
                </div>
              </SelectItem>
              <SelectItem value="route">
                <div className="flex items-center gap-2">
                  <RouteIcon className="h-3.5 w-3.5" />
                  Route
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Driver / Route selector */}
        {mode === 'driver' ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Driver</Label>
            <Select
              value={selectedDriverId ?? ''}
              onValueChange={(v) => setSelectedDriverId(v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select a driver..." />
              </SelectTrigger>
              <SelectContent>
                {driversLoading && (
                  <div className="p-2 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                  </div>
                )}
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} ({d.deviceId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs">Route</Label>
            <Select
              value={selectedRouteId ?? ''}
              onValueChange={(v) => setSelectedRouteId(v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select a route..." />
              </SelectTrigger>
              <SelectContent>
                {routesLoading && (
                  <div className="p-2 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                  </div>
                )}
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.scheduledDate} — {r.status}
                    {r.totalStops > 0 && ` (${r.completedStops}/${r.totalStops})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Date range */}
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Time Range
          </Label>
          <div className="space-y-2">
            <div>
              <span className="text-[10px] text-muted-foreground">From</span>
              <Input
                type="datetime-local"
                value={localFrom}
                onChange={(e) => setLocalFrom(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">To</span>
              <Input
                type="datetime-local"
                value={localTo}
                onChange={(e) => setLocalTo(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Quick range buttons */}
          <div className="flex gap-1.5 pt-1">
            {[
              { label: 'Today', days: 0 },
              { label: '1d', days: 1 },
              { label: '3d', days: 3 },
              { label: '7d', days: 7 },
            ].map(({ label, days }) => (
              <Button
                key={label}
                variant="outline"
                size="sm"
                className="h-7 text-[10px] flex-1"
                onClick={() => handleQuickRange(days)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Search button */}
        <Button
          className="w-full"
          onClick={handleSearch}
          disabled={!canSearch}
        >
          <Search className="h-4 w-4 mr-2" />
          Load History
        </Button>

        {/* Results summary */}
        {positions.length > 0 && (
          <div className="p-3 rounded-md bg-secondary/50 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Data points</span>
              <Badge variant="secondary">{positions.length}</Badge>
            </div>
            {positions.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Start</span>
                  <span className="font-mono text-[10px]">
                    {format(new Date(positions[0].time), 'HH:mm:ss')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">End</span>
                  <span className="font-mono text-[10px]">
                    {format(new Date(positions[positions.length - 1].time), 'HH:mm:ss')}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
