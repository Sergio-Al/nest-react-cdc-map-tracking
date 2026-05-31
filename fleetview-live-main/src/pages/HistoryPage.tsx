import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/playback.store';
import { useDriverHistory } from '@/hooks/api/useHistory';
import { useDrivers } from '@/hooks/api/useDrivers';
import { useSocket } from '@/hooks/useSocket';
import { RouteHistoryFilter, type FilterToggles } from '@/components/history/RouteHistoryFilter';
import { RouteHistoryTripsPanel } from '@/components/history/RouteHistoryTripsPanel';
import { RouteHistoryMap } from '@/components/history/RouteHistoryMap';
import { RouteHistoryDetail } from '@/components/history/RouteHistoryDetail';
import { Footer } from '@/components/dashboard/Footer';
import { getMockRoutePath } from '@/lib/mock/historyMock';
import { List, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Panel mode toggle (Filter form vs. Trips list) ───────────────────────────
type LeftPanel = 'filter' | 'trips';

export default function HistoryPage() {
  const {
    selectedDriverId,
    dateFrom,
    dateTo,
    positions,
    isPlaying,
    currentIndex,
    setPositions,
    reset,
  } = usePlaybackStore();

  const { isConnected } = useSocket();
  const { data: drivers = [] } = useDrivers();
  const { t } = useTranslation('history');

  // Fetch real driver history when all params are set
  const { data: driverHistory } = useDriverHistory(selectedDriverId, dateFrom, dateTo);

  // Push real data → store, fall back to mock when empty
  useEffect(() => {
    if (driverHistory && driverHistory.length > 0) {
      setPositions(driverHistory);
    } else if (selectedDriverId && dateFrom && dateTo && !driverHistory) {
      // query not yet resolved — do nothing (avoid flash)
    } else if (!selectedDriverId) {
      // No driver selected yet — use mock fallback for demo
      const mock = getMockRoutePath();
      setPositions(mock);
    }
  }, [driverHistory, selectedDriverId, dateFrom, dateTo, setPositions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => reset();
  }, [reset]);

  // ── Local UI state ────────────────────────────────────────────────────────
  const [leftPanel, setLeftPanel] = useState<LeftPanel>('filter');

  const [toggles, setToggles] = useState<FilterToggles>({
    speedPath:      true,
    stopMarkers:    true,
    idleEvents:     true,
    speedingEvents: false,
  });

  const handleToggle = (key: keyof FilterToggles, val: boolean) => {
    setToggles((prev) => ({ ...prev, [key]: val }));
  };

  // Determine page state
  // empty  = no driver, no positions
  // loaded = positions present, not playing
  // playback = playing or scrubbed (currentIndex > 0 while stopped)
  const hasPositions = positions.length > 0;
  // Playback (H3) persists once started — visible while playing OR after scrubbing,
  // and hidden again only when a fresh trip loads (setPositions resets currentIndex).
  const showPlayback = hasPositions && (isPlaying || currentIndex > 0);

  // Resolve selected driver object for map/detail panels
  const selectedDriver = drivers.find((d) => d.id === selectedDriverId) ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Three-column body */}
      <div className="flex min-h-0 flex-1">
        {/* Left panel toggle button (small strip above left panel) */}
        <div className="flex flex-col">
          {/* Panel mode switch */}
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-r border-border bg-background px-2">
            <button
              type="button"
              title={t('page.filterTab')}
              onClick={() => setLeftPanel('filter')}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-[5px] transition-colors',
                leftPanel === 'filter'
                  ? 'bg-mc-accent-soft text-mc-accent'
                  : 'text-muted-foreground hover:bg-mc-surface hover:text-foreground',
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title={t('page.tripsTab')}
              onClick={() => setLeftPanel('trips')}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-[5px] transition-colors',
                leftPanel === 'trips'
                  ? 'bg-mc-accent-soft text-mc-accent'
                  : 'text-muted-foreground hover:bg-mc-surface hover:text-foreground',
              )}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Left panel content */}
          <div className="flex min-h-0 flex-1">
            {leftPanel === 'filter' ? (
              <RouteHistoryFilter toggles={toggles} onToggleChange={handleToggle} />
            ) : (
              <RouteHistoryTripsPanel />
            )}
          </div>
        </div>

        {/* Map workspace — flex-1 */}
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <RouteHistoryMap
            driver={selectedDriver}
            toggles={toggles}
            showPlayback={showPlayback}
          />
        </div>

        {/* Right detail panel */}
        <RouteHistoryDetail driver={selectedDriver} />
      </div>

      {/* Footer */}
      <Footer isConnected={isConnected} />
    </div>
  );
}
