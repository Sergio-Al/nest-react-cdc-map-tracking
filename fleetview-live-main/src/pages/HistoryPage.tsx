import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { HistorySidebar } from '@/components/history/HistorySidebar';
import { HistoryMap } from '@/components/history/HistoryMap';
import { PlaybackControls } from '@/components/history/PlaybackControls';
import { usePlaybackStore } from '@/stores/playback.store';
import { useDriverHistory, useRouteHistory } from '@/hooks/api/useHistory';

export default function HistoryPage() {
  const {
    mode,
    selectedDriverId,
    selectedRouteId,
    dateFrom,
    dateTo,
    setPositions,
    reset,
  } = usePlaybackStore();

  // Fetch history data based on mode
  const {
    data: driverHistory,
    isLoading: driverLoading,
    isError: driverError,
  } = useDriverHistory(
    mode === 'driver' ? selectedDriverId : null,
    dateFrom,
    dateTo,
  );

  const {
    data: routeHistory,
    isLoading: routeLoading,
    isError: routeError,
  } = useRouteHistory(
    mode === 'route' ? selectedRouteId : null,
    dateFrom,
    dateTo,
  );

  // Push fetched data into the playback store
  useEffect(() => {
    if (mode === 'driver' && driverHistory) {
      setPositions(driverHistory);
    }
  }, [driverHistory, mode, setPositions]);

  useEffect(() => {
    if (mode === 'route' && routeHistory) {
      setPositions(routeHistory);
    }
  }, [routeHistory, mode, setPositions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => reset();
  }, [reset]);

  const isLoading = driverLoading || routeLoading;
  const isError = driverError || routeError;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="flex-1 flex min-h-0 p-3 gap-3">
        {/* Sidebar */}
        <HistorySidebar />

        {/* Main content */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Map */}
          <div className="flex-1 flex flex-col relative min-h-0">
            {isLoading && (
              <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/50 rounded-lg">
                <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-lg shadow-md text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading history...
                </div>
              </div>
            )}
            {isError && (
              <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/50 rounded-lg">
                <div className="bg-destructive/10 text-destructive px-4 py-2 rounded-lg text-sm">
                  Failed to load history data. Check your date range and try again.
                </div>
              </div>
            )}
            <HistoryMap />
          </div>

          {/* Playback controls */}
          <PlaybackControls />
        </div>
      </div>
    </div>
  );
}
