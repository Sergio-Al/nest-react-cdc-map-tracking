import { useState } from 'react';
import {
  History,
  User,
  Car,
  Clock,
  Search,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { useDrivers } from '@/hooks/api/useDrivers';
import { usePlaybackStore } from '@/stores/playback.store';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Driver } from '@/types/driver.types';

export interface FilterToggles {
  speedPath: boolean;
  stopMarkers: boolean;
  idleEvents: boolean;
  speedingEvents: boolean;
}

interface RouteHistoryFilterProps {
  toggles: FilterToggles;
  onToggleChange: (key: keyof FilterToggles, val: boolean) => void;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');
}

export function RouteHistoryFilter({ toggles, onToggleChange }: RouteHistoryFilterProps) {
  const {
    selectedDriverId,
    dateFrom,
    dateTo,
    positions,
    setSelectedDriverId,
    setDateRange,
  } = usePlaybackStore();

  const { data: drivers = [], isLoading: driversLoading } = useDrivers();
  const { t } = useTranslation('history');

  const loaded = positions.length > 0;

  // Local date-time inputs
  const [localFrom, setLocalFrom] = useState(
    dateFrom
      ? format(new Date(dateFrom), "yyyy-MM-dd'T'HH:mm")
      : format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"),
  );
  const [localTo, setLocalTo] = useState(
    dateTo
      ? format(new Date(dateTo), "yyyy-MM-dd'T'HH:mm")
      : format(endOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"),
  );

  // Search-by: 'driver' | 'vehicle' (vehicle is visual-only for now)
  const [searchBy, setSearchBy] = useState<'driver' | 'vehicle'>('driver');
  const [driverOpen, setDriverOpen] = useState(false);

  const selectedDriver: Driver | undefined = drivers.find((d) => d.id === selectedDriverId);

  const handlePreset = (label: 'today' | '1d' | '3d' | '7d') => {
    const now = new Date();
    let from: Date;
    let to: Date;
    if (label === 'today') {
      from = startOfDay(now);
      to = endOfDay(now);
    } else {
      const days = label === '1d' ? 1 : label === '3d' ? 3 : 7;
      from = startOfDay(subDays(now, days));
      to = endOfDay(now);
    }
    setLocalFrom(format(from, "yyyy-MM-dd'T'HH:mm"));
    setLocalTo(format(to, "yyyy-MM-dd'T'HH:mm"));
  };

  const activePreset = ((): 'today' | '1d' | '3d' | '7d' | null => {
    try {
      const f = new Date(localFrom);
      const t = new Date(localTo);
      const now = new Date();
      const diffDays = Math.round((now.getTime() - f.getTime()) / 86400000);
      if (diffDays <= 1 && f.getHours() === 0) return 'today';
      if (diffDays === 1) return '1d';
      if (diffDays === 3) return '3d';
      if (diffDays === 7) return '7d';
    } catch { /* ignore */ }
    return null;
  })();

  const handleLoad = () => {
    const from = new Date(localFrom).toISOString();
    const to = new Date(localTo).toISOString();
    setDateRange(from, to);
  };

  const canLoad = !!selectedDriverId && !!localFrom && !!localTo;

  return (
    <aside
      className="flex w-[320px] shrink-0 flex-col border-r border-border bg-background"
      style={{ minHeight: 0 }}
    >
      {/* Header */}
      <div className="flex items-center gap-[9px] border-b border-border px-4 py-[14px]">
        <div
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-mc-accent-border bg-mc-accent-soft text-mc-accent"
        >
          <History className="h-[14px] w-[14px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold tracking-[-0.005em]">{t('filter.title')}</div>
          <div className="mt-px text-[11px] text-muted-foreground">{t('filter.subtitle')}</div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 py-[14px]">
        {/* Search by segmented control */}
        <div>
          <div className="field-label mb-[6px] text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            {t('filter.searchBy')}
          </div>
          <div className="grid grid-cols-2 gap-[2px] rounded-[8px] border border-border bg-mc-surface p-[3px]">
            {(['driver', 'vehicle'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSearchBy(opt)}
                className={cn(
                  'flex h-[26px] items-center justify-center gap-[6px] rounded-[6px] text-[12px] font-medium transition-colors',
                  searchBy === opt
                    ? 'bg-mc-elev text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.06),0_0_0_1px_var(--mc-border)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt === 'driver' ? (
                  <User className="h-3 w-3" />
                ) : (
                  <Car className="h-3 w-3" />
                )}
                <span>{t(opt === 'driver' ? 'filter.byDriver' : 'filter.byVehicle')}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Driver select */}
        <div>
          <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            {t('filter.driver')}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setDriverOpen((v) => !v)}
              className="flex h-8 w-full items-center gap-2 rounded-[7px] border border-border bg-mc-elev px-[10px] text-[12.5px] transition-colors hover:border-mc-border-strong"
            >
              {driversLoading ? (
                <Loader2 className="h-[13px] w-[13px] shrink-0 animate-spin text-mc-text-dim" />
              ) : selectedDriver ? (
                <>
                  <span
                    className="inline-grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-mc-accent-soft font-mono text-[9.5px] font-bold text-mc-accent"
                  >
                    {initials(selectedDriver.name)}
                  </span>
                  <span className="flex-1 truncate text-left text-foreground">
                    {selectedDriver.name}
                  </span>
                  {selectedDriver.vehiclePlate && (
                    <span className="ml-auto font-mono text-[10.5px] text-mc-text-dim">
                      {selectedDriver.vehiclePlate}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <User className="h-[13px] w-[13px] shrink-0 text-mc-text-dim" />
                  <span className="flex-1 text-left text-mc-text-dim">{t('filter.selectDriver')}</span>
                  <ChevronDown className="ml-auto h-[13px] w-[13px] text-mc-text-dim" />
                </>
              )}
            </button>

            {driverOpen && (
              <div
                className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-48 overflow-y-auto rounded-[7px] border border-border bg-mc-elev shadow-mc-float"
              >
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
                    {d.vehiclePlate && (
                      <span className="font-mono text-[10px] text-mc-text-dim">{d.vehiclePlate}</span>
                    )}
                  </button>
                ))}
                {!driversLoading && drivers.length === 0 && (
                  <div className="p-3 text-center text-[11px] text-mc-text-dim">{t('filter.noDrivers')}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Time range */}
        <div>
          <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            {t('filter.timeRange')}
          </div>

          {/* Date range picker (shared with Reports) */}
          <DateRangePicker
            from={localFrom.slice(0, 10)}
            to={localTo.slice(0, 10)}
            onChange={(f, t) => {
              setLocalFrom(`${f}T${localFrom.slice(11, 16)}`);
              setLocalTo(`${t}T${localTo.slice(11, 16)}`);
            }}
            numberOfMonths={1}
            className="h-8 w-full"
          />

          {/* Time-only inputs */}
          <div className="mt-2 grid grid-cols-[1fr_14px_1fr] items-end gap-2">
            <div>
              <div className="mb-1 text-[10px] text-mc-text-dim">{t('filter.fromTime')}</div>
              <div className="flex h-8 items-center gap-2 rounded-[7px] border border-border bg-mc-elev px-[10px] transition-colors hover:border-mc-border-strong">
                <Clock className="h-[13px] w-[13px] shrink-0 text-mc-text-dim" />
                <input
                  type="time"
                  value={localFrom.slice(11, 16)}
                  onChange={(e) =>
                    setLocalFrom(`${localFrom.slice(0, 10)}T${e.target.value}`)
                  }
                  className="flex-1 bg-transparent text-[12px] text-foreground outline-none"
                />
              </div>
            </div>
            <div className="pb-2 text-center text-[11px] text-mc-text-dim">→</div>
            <div>
              <div className="mb-1 text-[10px] text-mc-text-dim">{t('filter.toTime')}</div>
              <div className="flex h-8 items-center gap-2 rounded-[7px] border border-border bg-mc-elev px-[10px] transition-colors hover:border-mc-border-strong">
                <Clock className="h-[13px] w-[13px] shrink-0 text-mc-text-dim" />
                <input
                  type="time"
                  value={localTo.slice(11, 16)}
                  onChange={(e) =>
                    setLocalTo(`${localTo.slice(0, 10)}T${e.target.value}`)
                  }
                  className="flex-1 bg-transparent text-[12px] text-foreground outline-none"
                />
              </div>
            </div>
          </div>

          {/* Presets */}
          <div className="mt-2 grid grid-cols-4 gap-[6px]">
            {(['today', '1d', '3d', '7d'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePreset(p)}
                className={cn(
                  'h-[26px] rounded-[6px] border font-mono text-[11.5px] transition-colors',
                  activePreset === p
                    ? 'border-mc-accent-border bg-mc-accent-soft text-mc-accent'
                    : 'border-border bg-mc-elev text-muted-foreground hover:bg-mc-surface hover:text-foreground',
                )}
              >
                {t(`filter.presets.${p}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Show on map toggles */}
        <div>
          <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            {t('filter.showOnMap')}
          </div>
          <div className="flex flex-col gap-[6px]">
            {(
              ['speedPath', 'stopMarkers', 'idleEvents', 'speedingEvents'] as (keyof FilterToggles)[]
            ).map((key) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-[7px] border border-border bg-mc-elev px-[10px] py-2 text-[12px]"
              >
                <span className="text-foreground">{t(`filter.toggles.${key}`)}</span>
                <Switch
                  checked={toggles[key]}
                  onCheckedChange={(val) => onToggleChange(key, val)}
                  className="scale-[0.8]"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-background px-4 py-3">
        <button
          type="button"
          onClick={handleLoad}
          disabled={!canLoad}
          className={cn(
            'flex h-[34px] w-full items-center justify-center gap-[7px] rounded-mc text-[12.5px] font-medium transition-colors',
            canLoad
              ? 'bg-mc-accent text-white hover:bg-mc-accent-strong'
              : 'cursor-not-allowed bg-mc-surface text-mc-text-dim',
          )}
        >
          <Search className="h-[13px] w-[13px]" />
          <span>{loaded ? t('filter.reloadHistory') : t('filter.loadHistory')}</span>
        </button>
      </div>
    </aside>
  );
}
