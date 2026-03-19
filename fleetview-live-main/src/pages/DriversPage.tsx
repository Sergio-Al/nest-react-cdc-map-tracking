import { useState } from 'react';
import { Plus, Users, Truck, Phone, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { useDrivers, useCreateDriver } from '@/hooks/api/useDrivers';
import { useAuthStore } from '@/stores/auth.store';
import { CreateDriverDialog } from '@/components/drivers/CreateDriverDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CreateDriverDto } from '@/hooks/api/useDrivers';

const STATUS_STYLES: Record<string, string> = {
  online: 'bg-green-500/15 text-green-600 border-green-500/20',
  offline: 'bg-secondary text-muted-foreground border-border',
  break: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/20',
};

export default function DriversPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const { data: drivers = [], isLoading, error } = useDrivers();
  const createDriver = useCreateDriver();

  const handleCreate = async (dto: CreateDriverDto) => {
    try {
      await createDriver.mutateAsync(dto);
      toast.success(`Driver "${dto.name}" created successfully`);
    } catch {
      toast.error('Failed to create driver');
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Drivers</h1>
            <p className="text-sm text-muted-foreground">
              Manage your fleet drivers
            </p>
          </div>
        </div>
        {(user?.role === 'admin' || user?.role === 'dispatcher') && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Driver
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12 text-muted-foreground">
          Failed to load drivers.
        </div>
      ) : drivers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No drivers yet.</p>
          {(user?.role === 'admin' || user?.role === 'dispatcher') && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add your first driver
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5" />
                    Vehicle
                  </span>
                </TableHead>
                <TableHead>
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    Phone
                  </span>
                </TableHead>
                <TableHead>
                  <span className="flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" />
                    Device ID
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((driver) => (
                <TableRow key={driver.id} className="border-border/50">
                  <TableCell className="font-medium">{driver.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_STYLES[driver.status] ?? STATUS_STYLES.offline}
                    >
                      {driver.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm capitalize">{driver.vehicleType}</span>
                    {driver.vehiclePlate && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({driver.vehiclePlate})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {driver.phone ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {driver.deviceId ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
