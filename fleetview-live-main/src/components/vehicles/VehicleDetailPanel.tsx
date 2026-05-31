import { Car, Pencil, Wrench, User, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DirectoryDetailPanel } from '@/components/ui/directory-detail-panel';
import { useDrivers } from '@/hooks/api/useDrivers';
import { cn } from '@/lib/utils';
import type { VehicleRow } from '@/components/reports/reportFilters';

interface Props {
  vehicle: VehicleRow | null;
  onClose: () => void;
  onEdit?: (vehicle: VehicleRow) => void;
  canEdit?: boolean;
}

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('');
}

export function VehicleDetailPanel({ vehicle, onClose, onEdit, canEdit }: Props) {
  const { data: drivers = [] } = useDrivers();

  if (!vehicle) {
    return (
      <DirectoryDetailPanel
        isEmpty
        emptyTitle="No vehicle selected"
        emptySubtitle="Pick a vehicle from the list to see its details and assigned driver."
      />
    );
  }

  const assignedDriver = vehicle.driverId ? drivers.find((d) => d.id === vehicle.driverId) : null;
  const isMaintenance = vehicle.status === 'maintenance';

  return (
    <DirectoryDetailPanel
      onClose={onClose}
      icon={
        <span className="inline-grid h-8 w-8 place-items-center rounded-full bg-mc-accent-soft text-mc-accent">
          <Car className="h-4 w-4" />
        </span>
      }
      title={<span className="font-mono">{vehicle.plate}</span>}
      subtitle={`${[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '—'} · ${vehicle.year ?? '—'}`}
      status={
        <span
          className={cn(
            'flex items-center gap-1 rounded-[5px] border px-[7px] py-[2px] font-mono text-[10.5px] font-medium capitalize',
            vehicle.status === 'active'
              ? 'border-[oklch(0.72_0.16_150/0.35)] bg-[oklch(0.72_0.16_150/0.12)] text-[oklch(0.55_0.16_150)] dark:text-[oklch(0.85_0.18_150)]'
              : isMaintenance
                ? 'border-[oklch(0.78_0.14_80/0.35)] bg-[oklch(0.78_0.14_80/0.12)] text-[oklch(0.55_0.14_80)] dark:text-[oklch(0.85_0.16_80)]'
                : 'border-border bg-mc-surface text-mc-text-muted',
          )}
        >
          {isMaintenance && <Wrench className="h-2.5 w-2.5" />}
          {vehicle.status}
        </span>
      }
      actions={
        canEdit && onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(vehicle)}
            className="flex h-8 items-center gap-[6px] rounded-mc bg-mc-accent px-3 text-[12px] font-medium text-white hover:bg-mc-accent-strong"
          >
            <Pencil className="h-[13px] w-[13px]" />
            <span>Edit</span>
          </button>
        ) : null
      }
    >
      <div className="flex flex-col gap-0">
        {/* Specs */}
        <div className="border-b border-border px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            Vehicle
          </div>
          <div className="overflow-hidden rounded-[8px] border border-border bg-mc-elev">
            <SpecRow label="Type" value={<span className="capitalize">{vehicle.type}</span>} />
            <SpecRow label="Brand" value={vehicle.brand ?? '—'} />
            <SpecRow label="Model" value={vehicle.model ?? '—'} />
            <SpecRow label="Year" value={vehicle.year ?? '—'} mono />
            <SpecRow label="Color" value={vehicle.color ?? '—'} />
            <SpecRow
              label="Capacity"
              value={vehicle.capacityKg != null ? `${vehicle.capacityKg} kg` : '—'}
              mono
              last
            />
          </div>
        </div>

        {/* Notes */}
        {vehicle.notes && (
          <div className="border-b border-border px-4 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
              Notes
            </div>
            <div className="rounded-[8px] border border-border bg-mc-elev p-3 text-[12px] text-foreground">
              {vehicle.notes}
            </div>
          </div>
        )}

        {/* Assigned driver */}
        <div className="px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            Assigned driver
          </div>
          {assignedDriver ? (
            <Link
              to="/drivers"
              className="flex items-center gap-2.5 rounded-[8px] border border-border bg-mc-elev p-3 transition-colors hover:border-mc-border-strong hover:bg-mc-surface"
            >
              <span className="inline-grid h-8 w-8 place-items-center rounded-full bg-mc-accent-soft font-mono text-[11px] font-bold text-mc-accent">
                {initials(assignedDriver.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground">
                  {assignedDriver.name}
                </div>
                <div className="font-mono text-[10.5px] text-mc-text-dim">
                  {assignedDriver.status} · {assignedDriver.phone ?? 'no phone'}
                </div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-mc-text-dim" />
            </Link>
          ) : (
            <Link
              to="/drivers"
              className="flex items-center justify-between gap-2 rounded-[8px] border border-dashed border-border bg-mc-surface p-3 text-[11.5px] text-mc-text-muted transition-colors hover:border-mc-border-strong hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                <User className="h-3.5 w-3.5" />
                No driver assigned
              </span>
              <span className="font-mono text-[10px]">go to drivers →</span>
            </Link>
          )}
        </div>
      </div>
    </DirectoryDetailPanel>
  );
}

function SpecRow({
  label,
  value,
  mono,
  last,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-[9px]',
        !last && 'border-b border-border',
      )}
    >
      <span className="text-[11.5px] text-mc-text-muted">{label}</span>
      <span className={cn('text-[12px] text-foreground', mono && 'font-mono text-[11.5px]')}>
        {value}
      </span>
    </div>
  );
}
