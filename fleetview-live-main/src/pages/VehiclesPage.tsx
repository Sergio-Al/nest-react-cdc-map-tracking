import { useMemo, useState } from 'react';
import { Plus, Car, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import {
  useVehicles,
  useCreateVehicle,
  useUpdateVehicle,
} from '@/hooks/api/useVehicles';
import { useDrivers } from '@/hooks/api/useDrivers';
import { useAuthStore } from '@/stores/auth.store';
import { useSocket } from '@/hooks/useSocket';
import { CreateVehicleDialog } from '@/components/vehicles/CreateVehicleDialog';
import { EditVehicleDialog } from '@/components/vehicles/EditVehicleDialog';
import { VehicleDetailPanel } from '@/components/vehicles/VehicleDetailPanel';
import { Footer } from '@/components/dashboard/Footer';
import { FilterBar, useDatasetFilters } from '@/components/filters';
import { TableShell, Td } from '@/components/ui/table-shell';
import {
  VEHICLE_FIELDS,
  VEHICLE_VIEWS,
  type VehicleRow,
} from '@/components/reports/reportFilters';
import { cn } from '@/lib/utils';
import type { CreateVehicleDto, UpdateVehicleDto } from '@/hooks/api/useVehicles';

export default function VehiclesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleRow | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const { isConnected } = useSocket();
  const { data: vehicles = [], isLoading } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();

  const isManager = user?.role === 'admin' || user?.role === 'dispatcher';

  const driverName = useMemo(() => new Map(drivers.map((d) => [d.id, d.name])), [drivers]);
  const rows = useMemo<VehicleRow[]>(
    () =>
      vehicles.map((v) => ({
        ...v,
        driverName: v.driverId ? driverName.get(v.driverId) ?? v.driverId.slice(0, 8) : '',
      })),
    [vehicles, driverName],
  );

  // NOTE: '-page' suffix avoids collision with Reports Vehicles tab 'vehicles' key.
  const ds = useDatasetFilters('vehicles-page', rows, VEHICLE_FIELDS, VEHICLE_VIEWS);

  const selected = useMemo(
    () => ds.filtered.find((v) => v.id === selectedId) ?? null,
    [ds.filtered, selectedId],
  );

  const handleCreate = async (dto: CreateVehicleDto) => {
    try {
      await createVehicle.mutateAsync(dto);
      toast.success(`Vehicle "${dto.plate}" created`);
    } catch {
      toast.error('Failed to create vehicle');
    }
  };

  const handleUpdate = async (id: string, dto: UpdateVehicleDto) => {
    try {
      await updateVehicle.mutateAsync({ id, dto });
      toast.success('Vehicle updated');
    } catch {
      toast.error('Failed to update vehicle');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-mc-accent-border bg-mc-accent-soft text-mc-accent">
            <Car className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[18px] font-semibold tracking-[-0.02em] text-foreground">
              Vehicles
            </div>
            <div className="mt-0.5 text-xs text-mc-text-muted">
              Manage your fleet vehicles · {vehicles.length} total
            </div>
          </div>
          {isManager && (
            <div className="ml-auto">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="flex h-8 items-center gap-[6px] rounded-mc bg-mc-accent px-3 text-[12.5px] font-medium text-white hover:bg-mc-accent-strong"
              >
                <Plus className="h-[13px] w-[13px]" />
                <span>New Vehicle</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <FilterBar
        fields={VEHICLE_FIELDS}
        rows={rows}
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
            { label: 'Plate' },
            { label: 'Type' },
            { label: 'Brand / Model' },
            { label: 'Year', num: true },
            { label: 'Capacity', num: true },
            { label: 'Status' },
            { label: 'Driver' },
          ]}
          count={ds.filtered.length}
          isLoading={isLoading}
          emptyMessage="No vehicles match these filters."
        >
          {ds.filtered.map((v) => {
            const isSelected = v.id === selectedId;
            const isMaintenance = v.status === 'maintenance';
            return (
              <tr
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-mc-surface',
                  isSelected && 'bg-mc-accent-soft/40',
                )}
              >
                <Td>
                  <span className="font-mono font-medium text-foreground">{v.plate}</span>
                </Td>
                <Td muted>
                  <span className="capitalize">{v.type}</span>
                </Td>
                <Td>{[v.brand, v.model].filter(Boolean).join(' ') || '—'}</Td>
                <Td num>{v.year ?? '—'}</Td>
                <Td num>{v.capacityKg != null ? `${v.capacityKg} kg` : '—'}</Td>
                <Td>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-[7px] py-[1px] font-mono text-[10.5px] font-semibold capitalize',
                      v.status === 'active'
                        ? 'bg-[oklch(0.72_0.16_150/0.16)] text-[oklch(0.45_0.16_150)] dark:text-[oklch(0.85_0.18_150)]'
                        : isMaintenance
                          ? 'bg-[oklch(0.78_0.14_80/0.2)] text-[oklch(0.5_0.14_80)] dark:text-[oklch(0.85_0.16_80)]'
                          : 'bg-mc-surface text-mc-text-muted',
                    )}
                  >
                    {isMaintenance && <Wrench className="h-2.5 w-2.5" />}
                    {v.status}
                  </span>
                </Td>
                <Td muted>{v.driverName || '—'}</Td>
              </tr>
            );
          })}
        </TableShell>

        <VehicleDetailPanel
          vehicle={selected}
          onClose={() => setSelectedId(null)}
          canEdit={isManager}
          onEdit={(veh) => {
            setEditingVehicle(veh);
            setEditOpen(true);
          }}
        />
      </div>

      <Footer isConnected={isConnected} />

      <CreateVehicleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isLoading={createVehicle.isPending}
      />

      <EditVehicleDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        vehicle={editingVehicle}
        onSubmit={handleUpdate}
        isLoading={updateVehicle.isPending}
      />
    </div>
  );
}
