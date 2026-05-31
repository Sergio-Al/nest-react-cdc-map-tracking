import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { exportToCsv } from '@/lib/utils';
import { useReportsStore } from '@/stores/reports.store';
import { useVisitCompletions } from '@/hooks/api/useHistory';
import { useDrivers } from '@/hooks/api/useDrivers';
import { useVehicles } from '@/hooks/api/useVehicles';
import { useCustomers } from '@/hooks/api/useRouteBuilder';
import { avatarTone, statusPill, type StatusKind } from './tones';
import { initialsOf } from '@/hooks/api/useReports';
import { useRegisterExporter } from '@/hooks/useReportExporter';
import { FilterBar, useDatasetFilters } from '@/components/filters';
import { TableShell, Td } from '@/components/ui/table-shell';
import {
  VISIT_FIELDS,
  VISIT_VIEWS,
  VEHICLE_FIELDS,
  VEHICLE_VIEWS,
  CUSTOMER_FIELDS,
  CUSTOMER_VIEWS,
  type VisitRow,
  type VehicleRow,
} from './reportFilters';

function Tag({ status, label }: { status: StatusKind; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[19px] items-center gap-1 rounded-full px-[7px] font-mono text-[10.5px] font-semibold capitalize',
        statusPill(status),
      )}
    >
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {label}
    </span>
  );
}

function fmtDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('es-BO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const VISIT_STATUS: Record<string, StatusKind> = {
  completed: 'completed',
  failed: 'missed',
  skipped: 'cancelled',
  in_progress: 'in_progress',
};

// ─── Visits ────────────────────────────────────────────────
export function VisitsTab() {
  const { from, to } = useReportsStore();
  const { data: visits = [], isLoading } = useVisitCompletions(from, to);
  const { data: drivers = [] } = useDrivers();
  const { data: customers = [] } = useCustomers();

  const driverName = useMemo(() => new Map(drivers.map((d) => [d.id, d.name])), [drivers]);
  const custName = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  const rows = useMemo<VisitRow[]>(
    () =>
      visits.map((v) => ({
        ...v,
        driverName: driverName.get(v.driverId) ?? v.driverId.slice(0, 8),
        customerName: custName.get(v.customerId) ?? `#${v.customerId}`,
      })),
    [visits, driverName, custName],
  );

  const ds = useDatasetFilters('visits', rows, VISIT_FIELDS, VISIT_VIEWS);

  const onExport = useCallback(() => {
    if (ds.filtered.length === 0) {
      toast.info('No visits to export');
      return;
    }
    exportToCsv(
      ds.filtered.map((v) => ({
        'Fecha/Hora': v.time,
        Conductor: v.driverName,
        Cliente: v.customerName,
        Tipo: v.visitType,
        Estado: v.status,
        'Duración (s)': v.durationSec ?? '',
        Puntual: v.onTime ? 'Sí' : 'No',
      })),
      'visitas',
    );
    toast.success(`Exported ${ds.filtered.length} visits`);
  }, [ds.filtered]);
  useRegisterExporter(onExport);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar
        fields={VISIT_FIELDS}
        rows={rows}
        filters={ds.filters}
        onChange={ds.updateFilters}
        views={ds.views}
        activeViewId={ds.activeViewId}
        onSelectView={ds.selectView}
        onSaveView={ds.saveView}
        onDeleteView={ds.deleteView}
      />
      <TableShell
        headers={[
          { label: 'Date / Time' },
          { label: 'Driver' },
          { label: 'Customer' },
          { label: 'Type' },
          { label: 'Status' },
          { label: 'Duration', num: true },
          { label: 'On-time' },
        ]}
        count={ds.filtered.length}
        isLoading={isLoading}
        emptyMessage="No visits match these filters."
        onExport={onExport}
      >
        {ds.filtered.map((v, i) => (
        <tr key={`${v.visitId}-${i}`} className="transition-colors hover:bg-mc-surface">
          <Td><span className="font-mono text-xs">{fmtDateTime(v.time)}</span></Td>
          <Td>
            <span className="inline-flex items-center gap-[7px]">
              <span className={cn('grid h-[22px] w-[22px] place-items-center rounded-full font-mono text-[9.5px] font-bold', avatarTone('green'))}>
                {initialsOf(v.driverName)}
              </span>
              <span className="text-foreground">{v.driverName}</span>
            </span>
          </Td>
          <Td>{v.customerName}</Td>
          <Td muted><span className="capitalize">{v.visitType}</span></Td>
          <Td><Tag status={VISIT_STATUS[v.status] ?? 'planned'} label={v.status} /></Td>
          <Td num>{v.durationSec != null ? `${Math.round(v.durationSec / 60)} min` : '—'}</Td>
          <Td>
            {v.onTime ? (
              <span className="text-[oklch(0.55_0.16_150)] dark:text-[oklch(0.78_0.16_150)]">✓</span>
            ) : (
              <span className="text-[oklch(0.6_0.18_25)]">✗</span>
            )}
          </Td>
        </tr>
        ))}
      </TableShell>
    </div>
  );
}

// ─── Vehicles ──────────────────────────────────────────────
export function VehiclesTab() {
  const { data: vehicles = [], isLoading } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const driverName = useMemo(() => new Map(drivers.map((d) => [d.id, d.name])), [drivers]);

  const rows = useMemo<VehicleRow[]>(
    () =>
      vehicles.map((v) => ({
        ...v,
        driverName: v.driverId ? driverName.get(v.driverId) ?? v.driverId.slice(0, 8) : '',
      })),
    [vehicles, driverName],
  );

  const ds = useDatasetFilters('vehicles', rows, VEHICLE_FIELDS, VEHICLE_VIEWS);

  const onExport = useCallback(() => {
    if (ds.filtered.length === 0) {
      toast.info('No vehicles to export');
      return;
    }
    exportToCsv(
      ds.filtered.map((v) => ({
        Placa: v.plate,
        Tipo: v.type,
        Marca: v.brand ?? '',
        Modelo: v.model ?? '',
        Año: v.year ?? '',
        'Capacidad (kg)': v.capacityKg ?? '',
        Estado: v.status,
        Conductor: v.driverName,
      })),
      'vehiculos',
    );
    toast.success(`Exported ${ds.filtered.length} vehicles`);
  }, [ds.filtered]);
  useRegisterExporter(onExport);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        onExport={onExport}
      >
        {ds.filtered.map((v) => (
        <tr key={v.id} className="transition-colors hover:bg-mc-surface">
          <Td><span className="font-mono text-foreground">{v.plate}</span></Td>
          <Td muted><span className="capitalize">{v.type}</span></Td>
          <Td>{[v.brand, v.model].filter(Boolean).join(' ') || '—'}</Td>
          <Td num>{v.year ?? '—'}</Td>
          <Td num>{v.capacityKg != null ? `${v.capacityKg} kg` : '—'}</Td>
          <Td><Tag status={v.status === 'active' ? 'completed' : 'cancelled'} label={v.status} /></Td>
          <Td muted>{v.driverName || '—'}</Td>
        </tr>
        ))}
      </TableShell>
    </div>
  );
}

// ─── Customers ─────────────────────────────────────────────
export function CustomersTab() {
  const { data: customers = [], isLoading } = useCustomers();

  const ds = useDatasetFilters('customers', customers, CUSTOMER_FIELDS, CUSTOMER_VIEWS);

  const onExport = useCallback(() => {
    if (ds.filtered.length === 0) {
      toast.info('No customers to export');
      return;
    }
    exportToCsv(
      ds.filtered.map((c) => ({
        Nombre: c.name,
        Tipo: c.customerType,
        Teléfono: c.phone ?? '',
        Dirección: c.address ?? '',
        'Geocerca (m)': c.geofenceRadiusMeters,
        Activo: c.active ? 'Sí' : 'No',
      })),
      'clientes',
    );
    toast.success(`Exported ${ds.filtered.length} customers`);
  }, [ds.filtered]);
  useRegisterExporter(onExport);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar
        fields={CUSTOMER_FIELDS}
        rows={customers}
        filters={ds.filters}
        onChange={ds.updateFilters}
        views={ds.views}
        activeViewId={ds.activeViewId}
        onSelectView={ds.selectView}
        onSaveView={ds.saveView}
        onDeleteView={ds.deleteView}
      />
      <TableShell
        headers={[
          { label: 'Customer' },
          { label: 'Type' },
          { label: 'Phone' },
          { label: 'Address' },
          { label: 'Geofence', num: true },
          { label: 'Status' },
        ]}
        count={ds.filtered.length}
        isLoading={isLoading}
        emptyMessage="No customers match these filters."
        onExport={onExport}
      >
        {ds.filtered.map((c) => (
        <tr key={c.id} className="transition-colors hover:bg-mc-surface">
          <Td><span className="font-medium text-foreground">{c.name}</span></Td>
          <Td muted><span className="capitalize">{c.customerType}</span></Td>
          <Td muted><span className="font-mono text-[11.5px]">{c.phone ?? '—'}</span></Td>
          <Td muted><span className="truncate">{c.address ?? '—'}</span></Td>
          <Td num>{c.geofenceRadiusMeters} m</Td>
          <Td><Tag status={c.active ? 'completed' : 'cancelled'} label={c.active ? 'active' : 'inactive'} /></Td>
        </tr>
        ))}
      </TableShell>
    </div>
  );
}
