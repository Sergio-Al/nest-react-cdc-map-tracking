import { useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useDrivers, useCreateDriver, useInitialPositions } from '@/hooks/api/useDrivers';
import { useAuthStore } from '@/stores/auth.store';
import { useSocket } from '@/hooks/useSocket';
import { CreateDriverDialog } from '@/components/drivers/CreateDriverDialog';
import { DriverDetailPanel } from '@/components/drivers/DriverDetailPanel';
import { Footer } from '@/components/dashboard/Footer';
import { FilterBar, useDatasetFilters } from '@/components/filters';
import { TableShell, Td } from '@/components/ui/table-shell';
import { DRIVER_FIELDS, DRIVER_VIEWS } from '@/components/reports/reportFilters';
import { cn } from '@/lib/utils';
import type { CreateDriverDto } from '@/hooks/api/useDrivers';

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('');
}

const STATUS_STYLES: Record<string, string> = {
  online: 'bg-[oklch(0.72_0.16_150/0.16)] text-[oklch(0.45_0.16_150)] dark:text-[oklch(0.85_0.18_150)]',
  break: 'bg-[oklch(0.78_0.14_80/0.2)] text-[oklch(0.5_0.14_80)] dark:text-[oklch(0.85_0.16_80)]',
  offline: 'bg-mc-surface text-mc-text-muted',
};

export default function DriversPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const { isConnected } = useSocket();
  const { data: drivers = [], isLoading } = useDrivers();
  const createDriver = useCreateDriver();

  // Seed `useMapStore.positions` from REST so the detail panel mini-map has data
  // even before any WebSocket tick arrives. Live updates still flow via the
  // dashboard's WebSocket subscription — this page only seeds the snapshot.
  useInitialPositions(drivers);

  const isManager = user?.role === 'admin' || user?.role === 'dispatcher';

  const ds = useDatasetFilters('drivers-page', drivers, DRIVER_FIELDS, DRIVER_VIEWS);

  const selected = useMemo(
    () => ds.filtered.find((d) => d.id === selectedId) ?? null,
    [ds.filtered, selectedId],
  );

  const handleCreate = async (dto: CreateDriverDto) => {
    try {
      await createDriver.mutateAsync(dto);
      toast.success(`Driver "${dto.name}" created`);
    } catch {
      toast.error('Failed to create driver');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-mc-accent-border bg-mc-accent-soft text-mc-accent">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[18px] font-semibold tracking-[-0.02em] text-foreground">
              Drivers
            </div>
            <div className="mt-0.5 text-xs text-mc-text-muted">
              Manage your fleet drivers · {drivers.length} total
            </div>
          </div>
          {isManager && (
            <div className="ml-auto">
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="flex h-8 items-center gap-[6px] rounded-mc bg-mc-accent px-3 text-[12.5px] font-medium text-white hover:bg-mc-accent-strong"
              >
                <Plus className="h-[13px] w-[13px]" />
                <span>New Driver</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <FilterBar
        fields={DRIVER_FIELDS}
        rows={drivers}
        filters={ds.filters}
        onChange={ds.updateFilters}
        views={ds.views}
        activeViewId={ds.activeViewId}
        onSelectView={ds.selectView}
        onSaveView={ds.saveView}
        onDeleteView={ds.deleteView}
      />

      <div className="flex min-h-0 flex-1">
        <TableShell
          headers={[
            { label: 'Driver' },
            { label: 'Status' },
            { label: 'Vehicle' },
            { label: 'Phone' },
            { label: 'Device ID' },
          ]}
          count={ds.filtered.length}
          isLoading={isLoading}
          emptyMessage="No drivers match these filters."
        >
          {ds.filtered.map((d) => {
            const isSelected = d.id === selectedId;
            return (
              <tr
                key={d.id}
                onClick={() => setSelectedId(d.id)}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-mc-surface',
                  isSelected && 'bg-mc-accent-soft/40',
                )}
              >
                <Td>
                  <span className="inline-flex items-center gap-[7px]">
                    <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-mc-accent-soft font-mono text-[9.5px] font-bold text-mc-accent">
                      {initials(d.name)}
                    </span>
                    <span className="text-foreground">{d.name}</span>
                  </span>
                </Td>
                <Td>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-[7px] py-[1px] font-mono text-[10.5px] font-semibold capitalize',
                      STATUS_STYLES[d.status] ?? STATUS_STYLES.offline,
                    )}
                  >
                    <span className="h-[5px] w-[5px] rounded-full bg-current" />
                    {d.status}
                  </span>
                </Td>
                <Td muted>
                  <span className="capitalize">{d.vehicleType}</span>
                  {d.vehiclePlate && (
                    <span className="ml-2 font-mono text-[10.5px] text-mc-text-dim">
                      {d.vehiclePlate}
                    </span>
                  )}
                </Td>
                <Td muted>
                  <span className="font-mono text-[11px]">{d.phone ?? '—'}</span>
                </Td>
                <Td muted>
                  <span className="font-mono text-[11px]">{d.deviceId ?? '—'}</span>
                </Td>
              </tr>
            );
          })}
        </TableShell>

        <DriverDetailPanel driver={selected} onClose={() => setSelectedId(null)} />
      </div>

      <Footer isConnected={isConnected} />

      <CreateDriverDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tenantId={user?.tenantId ?? ''}
        onSubmit={handleCreate}
        isLoading={createDriver.isPending}
      />
    </div>
  );
}
