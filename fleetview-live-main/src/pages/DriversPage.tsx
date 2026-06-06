import { useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  useDrivers,
  useCreateDriver,
  useUpdateDriver,
  useDeactivateDriver,
  useInitialPositions,
  useCreateDriverLogin,
} from '@/hooks/api/useDrivers';
import { translateApiError } from '@/lib/apiError';
import { useAuthStore } from '@/stores/auth.store';
import { useSocket } from '@/hooks/useSocket';
import { CreateDriverDialog } from '@/components/drivers/CreateDriverDialog';
import { CreateDriverLoginDialog } from '@/components/drivers/CreateDriverLoginDialog';
import { DriverDetailPanel } from '@/components/drivers/DriverDetailPanel';
import { Footer } from '@/components/dashboard/Footer';
import { FilterBar, useDatasetFilters } from '@/components/filters';
import { TableShell, Td } from '@/components/ui/table-shell';
import { DRIVER_FIELDS, DRIVER_VIEWS } from '@/components/reports/reportFilters';
import { cn } from '@/lib/utils';
import type { CreateDriverDto, UpdateDriverDto } from '@/hooks/api/useDrivers';
import type { Driver } from '@/types/driver.types';

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
  const [editDriver, setEditDriver] = useState<Driver | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loginDialogDriver, setLoginDialogDriver] = useState<Driver | null>(null);

  const user = useAuthStore((s) => s.user);
  const { isConnected } = useSocket();
  const { data: drivers = [], isLoading } = useDrivers();
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const deactivateDriver = useDeactivateDriver();
  const createDriverLogin = useCreateDriverLogin();
  const { t } = useTranslation('drivers');

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
      toast.success(t('toasts.created', { name: dto.name }));
    } catch {
      toast.error(t('toasts.createFailed'));
    }
  };

  const handleUpdate = async (id: string, dto: UpdateDriverDto) => {
    try {
      await updateDriver.mutateAsync({ id, dto });
      toast.success(t('toasts.updated', { name: dto.name ?? '' }));
    } catch {
      toast.error(t('toasts.updateFailed'));
    }
  };

  const handleDeactivate = async (driver: Driver) => {
    try {
      await deactivateDriver.mutateAsync(driver.id);
      toast.success(t('toasts.deactivated', { name: driver.name }));
      if (selectedId === driver.id) setSelectedId(null);
    } catch {
      toast.error(t('toasts.deactivateFailed'));
    }
  };

  const handleCreateLogin = async ({ email, password }: { email: string; password: string }) => {
    if (!loginDialogDriver) return;
    try {
      await createDriverLogin.mutateAsync({ id: loginDialogDriver.id, email, password });
      toast.success(t('toasts.loginCreated', { name: loginDialogDriver.name }));
      setLoginDialogDriver(null);
    } catch (err) {
      toast.error(
        translateApiError(err, t('toasts.loginCreateFailed')),
      );
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
              {t('page.title')}
            </div>
            <div className="mt-0.5 text-xs text-mc-text-muted">
              {t('page.subtitle', { count: drivers.length })}
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
                <span>{t('page.newDriver')}</span>
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
            { label: t('table.driver') },
            { label: t('table.status') },
            { label: t('table.vehicle') },
            { label: t('table.phone') },
            { label: t('table.deviceId') },
          ]}
          count={ds.filtered.length}
          isLoading={isLoading}
          emptyMessage={t('table.empty')}
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
                      'inline-flex items-center gap-1 rounded-full px-[7px] py-[1px] font-mono text-[10.5px] font-semibold',
                      STATUS_STYLES[d.status] ?? STATUS_STYLES.offline,
                    )}
                  >
                    <span className="h-[5px] w-[5px] rounded-full bg-current" />
                    {t(`status.${d.status}`, { defaultValue: d.status })}
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

        <DriverDetailPanel
          driver={selected}
          canManage={isManager}
          onEdit={(d) => setEditDriver(d)}
          onDeactivate={handleDeactivate}
          isDeactivating={deactivateDriver.isPending}
          onClose={() => setSelectedId(null)}
          onCreateLogin={(d) => setLoginDialogDriver(d)}
        />
      </div>

      <Footer isConnected={isConnected} />

      <CreateDriverDialog
        open={dialogOpen || !!editDriver}
        onOpenChange={(o) => {
          if (!o) {
            setDialogOpen(false);
            setEditDriver(null);
          } else {
            setDialogOpen(true);
          }
        }}
        driver={editDriver}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        isLoading={createDriver.isPending || updateDriver.isPending}
      />

      <CreateDriverLoginDialog
        open={!!loginDialogDriver}
        onOpenChange={(o) => { if (!o) setLoginDialogDriver(null); }}
        driver={loginDialogDriver}
        onSubmit={handleCreateLogin}
        isLoading={createDriverLogin.isPending}
      />
    </div>
  );
}
