import { useState } from 'react';
import { Pencil, PowerOff, Phone, Hash, Truck, ExternalLink, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DirectoryDetailPanel, type DirectoryDetailTab } from '@/components/ui/directory-detail-panel';
import { LocationPickerMap } from '@/components/ui/location-picker-map';
import { useMapStore } from '@/stores/map.store';
import { useVehicles } from '@/hooks/api/useVehicles';
import { cn } from '@/lib/utils';
import type { Driver } from '@/types/driver.types';

type Tab = 'overview' | 'vehicle';

interface Props {
  driver: Driver | null;
  onClose: () => void;
}

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('');
}

const STATUS_STYLES: Record<string, string> = {
  online: 'border-[oklch(0.72_0.16_150/0.35)] bg-[oklch(0.72_0.16_150/0.12)] text-[oklch(0.55_0.16_150)] dark:text-[oklch(0.85_0.18_150)]',
  break: 'border-[oklch(0.78_0.14_80/0.35)] bg-[oklch(0.78_0.14_80/0.12)] text-[oklch(0.55_0.14_80)] dark:text-[oklch(0.85_0.16_80)]',
  offline: 'border-border bg-mc-surface text-mc-text-muted',
};

export function DriverDetailPanel({ driver, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const position = useMapStore((s) => (driver ? s.positions[driver.id] : null));
  const { data: vehicles = [] } = useVehicles();

  if (!driver) {
    return (
      <DirectoryDetailPanel
        isEmpty
        emptyTitle="No driver selected"
        emptySubtitle="Pick a driver from the list to see contact, assigned vehicle and last-known position."
      />
    );
  }

  const assignedVehicle = driver.vehiclePlate
    ? vehicles.find((v) => v.plate === driver.vehiclePlate)
    : null;

  const tabs: DirectoryDetailTab[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'vehicle', label: 'Vehicle' },
  ];

  return (
    <DirectoryDetailPanel
      onClose={onClose}
      icon={
        <span className="inline-grid h-8 w-8 place-items-center rounded-full bg-mc-accent-soft font-mono text-[11px] font-bold text-mc-accent">
          {initials(driver.name)}
        </span>
      }
      title={driver.name}
      subtitle={`${driver.vehiclePlate ?? 'no vehicle'} · ${driver.deviceId ?? 'no device'}`}
      status={
        <span
          className={cn(
            'flex items-center gap-1 rounded-[5px] border px-[7px] py-[2px] font-mono text-[10.5px] font-medium capitalize',
            STATUS_STYLES[driver.status] ?? STATUS_STYLES.offline,
          )}
        >
          <span
            className="inline-block h-[5px] w-[5px] rounded-full bg-current"
            style={{ opacity: 0.75 }}
          />
          {driver.status}
        </span>
      }
      actions={
        // Edit / Deactivate hooks (PATCH /drivers/:id, DELETE) don't exist yet — disabled with tooltip.
        <>
          <button
            type="button"
            disabled
            title="Backend endpoint not yet available"
            className="flex h-8 cursor-not-allowed items-center gap-[6px] rounded-mc border border-border bg-mc-elev px-3 text-[12px] font-medium text-mc-text-dim"
          >
            <Pencil className="h-[13px] w-[13px]" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            disabled
            title="Backend endpoint not yet available"
            className="flex h-8 cursor-not-allowed items-center gap-[6px] rounded-mc border border-border bg-mc-elev px-3 text-[12px] font-medium text-mc-text-dim"
          >
            <PowerOff className="h-[13px] w-[13px]" />
            <span>Deactivate</span>
          </button>
        </>
      }
      tabs={tabs}
      activeTabId={activeTab}
      onTabChange={(id) => setActiveTab(id as Tab)}
    >
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-0">
          {/* Last-known position */}
          <div className="border-b border-border px-4 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
              Last-known position
            </div>
            {position ? (
              <>
                <LocationPickerMap lat={position.latitude} lng={position.longitude} height={170} />
                <div className="mt-2 flex items-center justify-between font-mono text-[10.5px] text-mc-text-dim">
                  <span>
                    {position.latitude.toFixed(4)}, {position.longitude.toFixed(4)}
                  </span>
                  <span>{Math.round(position.speed)} km/h</span>
                </div>
              </>
            ) : (
              <div className="grid h-[170px] place-items-center rounded-[8px] border border-dashed border-border bg-mc-surface text-[11.5px] text-mc-text-muted">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  No recent position
                </span>
              </div>
            )}
          </div>

          {/* Contact */}
          <div className="px-4 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
              Contact
            </div>
            <div className="overflow-hidden rounded-[8px] border border-border bg-mc-elev">
              <Row
                icon={<Phone className="h-3.5 w-3.5 text-mc-text-dim" />}
                label="Phone"
                value={driver.phone ?? '—'}
              />
              <Row
                icon={<Hash className="h-3.5 w-3.5 text-mc-text-dim" />}
                label="Device ID"
                value={driver.deviceId ?? '—'}
                last
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'vehicle' && (
        <div className="px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            Assigned vehicle
          </div>
          {assignedVehicle ? (
            <Link
              to="/vehicles"
              className="flex items-center gap-2.5 rounded-[8px] border border-border bg-mc-elev p-3 transition-colors hover:border-mc-border-strong hover:bg-mc-surface"
            >
              <span className="inline-grid h-8 w-8 place-items-center rounded-lg bg-mc-accent-soft text-mc-accent">
                <Truck className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[13px] font-semibold text-foreground">
                  {assignedVehicle.plate}
                </div>
                <div className="font-mono text-[10.5px] text-mc-text-dim">
                  {[assignedVehicle.brand, assignedVehicle.model].filter(Boolean).join(' ') ||
                    assignedVehicle.type}{' '}
                  · {assignedVehicle.status}
                </div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-mc-text-dim" />
            </Link>
          ) : (
            <Link
              to="/vehicles"
              className="flex items-center justify-between gap-2 rounded-[8px] border border-dashed border-border bg-mc-surface p-3 text-[11.5px] text-mc-text-muted transition-colors hover:border-mc-border-strong hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5" />
                No vehicle assigned
              </span>
              <span className="font-mono text-[10px]">go to vehicles →</span>
            </Link>
          )}
        </div>
      )}
    </DirectoryDetailPanel>
  );
}

function Row({
  icon,
  label,
  value,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-[9px]',
        !last && 'border-b border-border',
      )}
    >
      {icon}
      <span className="text-[11.5px] text-mc-text-muted">{label}</span>
      <span className="ml-auto truncate font-mono text-[11.5px] text-foreground">{value}</span>
    </div>
  );
}
