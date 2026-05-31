import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
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
import { useDateLocale } from '@/i18n/useDateLocale';
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
  const { t, i18n } = useTranslation('reports');
  const dateLocale = useDateLocale();

  const fmtDateTime = (value: string): string => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString(i18n.language, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
      toast.info(t('exportToasts.noVisits'));
      return;
    }
    exportToCsv(
      ds.filtered.map((v) => ({
        [t('csvHeaders.dateTime')]: v.time,
        [t('csvHeaders.driver')]: v.driverName,
        [t('csvHeaders.customer')]: v.customerName,
        [t('csvHeaders.type')]: v.visitType,
        [t('csvHeaders.status')]: v.status,
        [t('csvHeaders.durationSec')]: v.durationSec ?? '',
        [t('csvHeaders.onTime')]: v.onTime ? t('csvHeaders.yes') : t('csvHeaders.no'),
      })),
      t('csvHeaders.visitas'),
    );
    toast.success(t('exportToasts.exportedVisits', { count: ds.filtered.length }));
  }, [ds.filtered, t]);
  useRegisterExporter(onExport);

  void dateLocale;

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
          { label: t('tables.visits.dateTime') },
          { label: t('tables.visits.driver') },
          { label: t('tables.visits.customer') },
          { label: t('tables.visits.type') },
          { label: t('tables.visits.status') },
          { label: t('tables.visits.duration'), num: true },
          { label: t('tables.visits.onTime') },
        ]}
        count={ds.filtered.length}
        isLoading={isLoading}
        emptyMessage={t('tables.visits.empty')}
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
          <Td num>
            {v.durationSec != null
              ? t('tables.visits.minutes', { minutes: Math.round(v.durationSec / 60) })
              : '—'}
          </Td>
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
  const { t } = useTranslation('reports');

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
      toast.info(t('exportToasts.noVehicles'));
      return;
    }
    exportToCsv(
      ds.filtered.map((v) => ({
        [t('csvHeaders.plate')]: v.plate,
        [t('csvHeaders.type')]: v.type,
        [t('csvHeaders.brand')]: v.brand ?? '',
        [t('csvHeaders.model')]: v.model ?? '',
        [t('csvHeaders.year')]: v.year ?? '',
        [t('csvHeaders.capacityKg')]: v.capacityKg ?? '',
        [t('csvHeaders.status')]: v.status,
        [t('csvHeaders.driver')]: v.driverName,
      })),
      t('csvHeaders.vehiculos'),
    );
    toast.success(t('exportToasts.exportedVehicles', { count: ds.filtered.length }));
  }, [ds.filtered, t]);
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
          { label: t('tables.vehicles.plate') },
          { label: t('tables.vehicles.type') },
          { label: t('tables.vehicles.brandModel') },
          { label: t('tables.vehicles.year'), num: true },
          { label: t('tables.vehicles.capacity'), num: true },
          { label: t('tables.vehicles.status') },
          { label: t('tables.vehicles.driver') },
        ]}
        count={ds.filtered.length}
        isLoading={isLoading}
        emptyMessage={t('tables.vehicles.empty')}
        onExport={onExport}
      >
        {ds.filtered.map((v) => (
        <tr key={v.id} className="transition-colors hover:bg-mc-surface">
          <Td><span className="font-mono text-foreground">{v.plate}</span></Td>
          <Td muted><span className="capitalize">{v.type}</span></Td>
          <Td>{[v.brand, v.model].filter(Boolean).join(' ') || '—'}</Td>
          <Td num>{v.year ?? '—'}</Td>
          <Td num>{v.capacityKg != null ? `${v.capacityKg} kg` : '—'}</Td>
          <Td>
            <Tag
              status={v.status === 'active' ? 'completed' : 'cancelled'}
              label={t(`tables.vehicles.${v.status === 'active' ? 'active' : 'inactive'}`)}
            />
          </Td>
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
  const { t } = useTranslation('reports');

  const ds = useDatasetFilters('customers', customers, CUSTOMER_FIELDS, CUSTOMER_VIEWS);

  const onExport = useCallback(() => {
    if (ds.filtered.length === 0) {
      toast.info(t('exportToasts.noCustomers'));
      return;
    }
    exportToCsv(
      ds.filtered.map((c) => ({
        [t('csvHeaders.name')]: c.name,
        [t('csvHeaders.type')]: c.customerType,
        [t('csvHeaders.phone')]: c.phone ?? '',
        [t('csvHeaders.address')]: c.address ?? '',
        [t('csvHeaders.geofenceM')]: c.geofenceRadiusMeters,
        [t('csvHeaders.active')]: c.active ? t('csvHeaders.yes') : t('csvHeaders.no'),
      })),
      t('csvHeaders.clientes'),
    );
    toast.success(t('exportToasts.exportedCustomers', { count: ds.filtered.length }));
  }, [ds.filtered, t]);
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
          { label: t('tables.customers.customer') },
          { label: t('tables.customers.type') },
          { label: t('tables.customers.phone') },
          { label: t('tables.customers.address') },
          { label: t('tables.customers.geofence'), num: true },
          { label: t('tables.customers.status') },
        ]}
        count={ds.filtered.length}
        isLoading={isLoading}
        emptyMessage={t('tables.customers.empty')}
        onExport={onExport}
      >
        {ds.filtered.map((c) => (
        <tr key={c.id} className="transition-colors hover:bg-mc-surface">
          <Td><span className="font-medium text-foreground">{c.name}</span></Td>
          <Td muted><span className="capitalize">{c.customerType}</span></Td>
          <Td muted><span className="font-mono text-[11.5px]">{c.phone ?? '—'}</span></Td>
          <Td muted><span className="truncate">{c.address ?? '—'}</span></Td>
          <Td num>{c.geofenceRadiusMeters} m</Td>
          <Td>
            <Tag
              status={c.active ? 'completed' : 'cancelled'}
              label={t(`tables.customers.${c.active ? 'active' : 'inactive'}`)}
            />
          </Td>
        </tr>
        ))}
      </TableShell>
    </div>
  );
}
