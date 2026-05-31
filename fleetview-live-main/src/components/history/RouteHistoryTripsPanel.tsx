/**
 * RouteHistoryTripsPanel — MOCK left-panel alternate (H4 variation)
 *
 * Shows a list of past trips for the selected driver. All trip data is MOCK.
 * Replace getMockTrips() with a real React Query hook (GET /drivers/:id/trips)
 * when the endpoint is available.
 */

import { useState } from 'react';
import { History, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/playback.store';
import { useDrivers } from '@/hooks/api/useDrivers';
import { getMockTrips } from '@/lib/mock/historyMock';
import { cn } from '@/lib/utils';
import type { Driver } from '@/types/driver.types';

type Window = '1d' | '3d' | '7d' | '30d';

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('');
}

interface RouteHistoryTripsPanelProps {
  /** Called when a trip card is selected (loads the trip into the playback store) */
  onTripSelect?: (tripIndex: number) => void;
}

export function RouteHistoryTripsPanel({ onTripSelect }: RouteHistoryTripsPanelProps) {
  const { selectedDriverId, setSelectedDriverId } = usePlaybackStore();
  const { data: drivers = [] } = useDrivers();
  const [window, setWindow] = useState<Window>('7d');
  const [driverOpen, setDriverOpen] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<number | null>(1);
  const { t } = useTranslation('history');

  const driver: Driver | undefined = drivers.find((d) => d.id === selectedDriverId);
  const trips = getMockTrips(selectedDriverId ?? 'mock');

  const handleTripClick = (i: number) => {
    setSelectedTrip(i);
    onTripSelect?.(i);
  };

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-r border-border bg-background" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center gap-[9px] border-b border-border px-4 py-[14px]">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-mc-accent-border bg-mc-accent-soft text-mc-accent">
          <History className="h-[14px] w-[14px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold tracking-[-0.005em]">{t('filter.title')}</div>
          <div className="mt-px text-[11px] text-muted-foreground">
            {driver ? t('trips.driverWindow', { name: driver.name, window }) : t('trips.selectDriverHint')}
          </div>
        </div>
      </div>

      {/* Body — driver + window */}
      <div className="flex flex-col gap-[14px] px-4 py-[14px]">
        {/* Driver select */}
        <div>
          <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            {t('trips.driver')}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setDriverOpen((v) => !v)}
              className="flex h-8 w-full items-center gap-2 rounded-[7px] border border-border bg-mc-elev px-[10px] text-[12.5px] transition-colors hover:border-mc-border-strong"
            >
              {driver ? (
                <>
                  <span className="inline-grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-mc-accent-soft font-mono text-[9.5px] font-bold text-mc-accent">
                    {initials(driver.name)}
                  </span>
                  <span className="flex-1 truncate text-left text-foreground">{driver.name}</span>
                  <ChevronDown className="ml-auto h-[13px] w-[13px] text-mc-text-dim" />
                </>
              ) : (
                <>
                  <span className="flex-1 text-left text-mc-text-dim">{t('trips.selectDriver')}</span>
                  <ChevronDown className="ml-auto h-[13px] w-[13px] text-mc-text-dim" />
                </>
              )}
            </button>
            {driverOpen && (
              <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-40 overflow-y-auto rounded-[7px] border border-border bg-mc-elev shadow-mc-float">
                {drivers.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setSelectedDriverId(d.id);
                      setDriverOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-mc-surface',
                      d.id === selectedDriverId && 'bg-mc-accent-soft text-mc-accent',
                    )}
                  >
                    <span className="inline-grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-mc-accent-soft font-mono text-[9.5px] font-bold text-mc-accent">
                      {initials(d.name)}
                    </span>
                    <span className="flex-1 truncate">{d.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Window presets */}
        <div>
          <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            {t('trips.window')}
          </div>
          <div className="grid grid-cols-4 gap-[6px]">
            {(['1d', '3d', '7d', '30d'] as Window[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                className={cn(
                  'h-[26px] rounded-[6px] border font-mono text-[11.5px] transition-colors',
                  window === w
                    ? 'border-mc-accent-border bg-mc-accent-soft text-mc-accent'
                    : 'border-border bg-mc-elev text-muted-foreground hover:bg-mc-surface hover:text-foreground',
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Trips list */}
      <div className="flex flex-1 flex-col overflow-hidden border-t border-border">
        <div className="flex items-center gap-2 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-mc-text-dim">
          <span>{t('trips.trips')}</span>
          <span className="ml-auto rounded-full border border-border bg-mc-surface px-[6px] py-px font-mono text-[10.5px] normal-case tracking-normal text-muted-foreground">
            {trips.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {trips.map((tr, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleTripClick(i)}
              className={cn(
                'w-full border-b border-b-[oklch(from_var(--border)_l_c_h_/_0.55)] px-4 py-[11px] text-left transition-colors hover:bg-mc-surface',
                selectedTrip === i && 'border-l-2 border-l-mc-accent bg-mc-surface',
              )}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[12px] font-semibold">{tr.date}</span>
                <span className="font-mono text-[10.5px] text-mc-text-dim">{tr.day}</span>
                <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
                  {t('trips.kmHours', { km: tr.km.toFixed(1), hours: tr.hrs })}
                </span>
              </div>
              <div className="mb-2 flex items-center gap-[6px] text-[11.5px] text-muted-foreground">
                <span className="max-w-[100px] truncate">{t('trips.depotAchumani')}</span>
                <span className="shrink-0 font-mono text-mc-text-dim">→</span>
                <span>{t('trips.stopsCount', { count: tr.stops })}</span>
                <span className="ml-auto font-mono text-[10.5px] text-mc-text-dim">
                  07:30 – 14:55
                </span>
              </div>
              <div className="flex h-1 overflow-hidden rounded-full bg-mc-surface">
                <span className="h-full bg-status-moving"    style={{ width: `${tr.segs[0]}%` }} />
                <span className="h-full bg-status-idle"      style={{ width: `${tr.segs[1]}%` }} />
                <span className="h-full bg-mc-accent"        style={{ width: `${tr.segs[2]}%` }} />
                <span className="h-full bg-mc-border-strong" style={{ width: `${tr.segs[3]}%` }} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
