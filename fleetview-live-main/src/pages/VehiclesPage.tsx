import { useState } from 'react';
import { Plus, Car, Wrench, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useVehicles, useCreateVehicle, useUpdateVehicle } from '@/hooks/api/useVehicles';
import { useAuthStore } from '@/stores/auth.store';
import { CreateVehicleDialog } from '@/components/vehicles/CreateVehicleDialog';
import { EditVehicleDialog } from '@/components/vehicles/EditVehicleDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Vehicle } from '@/types/vehicle.types';
import type { CreateVehicleDto, UpdateVehicleDto } from '@/hooks/api/useVehicles';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-500/15 text-green-600 border-green-500/20',
  maintenance: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/20',
  inactive: 'bg-secondary text-muted-foreground border-border',
};

export default function VehiclesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [searchPlate, setSearchPlate] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const user = useAuthStore((s) => s.user);
  const { data: vehicles = [], isLoading, error } = useVehicles();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();

  const isManager = user?.role === 'admin' || user?.role === 'dispatcher';

  const handleCreate = async (dto: CreateVehicleDto) => {
    try {
      await createVehicle.mutateAsync(dto);
      toast.success(`Vehicle "${dto.plate}" created successfully`);
    } catch {
      toast.error('Failed to create vehicle');
    }
  };

  const handleUpdate = async (id: string, dto: UpdateVehicleDto) => {
    try {
      await updateVehicle.mutateAsync({ id, dto });
      toast.success('Vehicle updated successfully');
    } catch {
      toast.error('Failed to update vehicle');
    }
  };

  const openEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setEditOpen(true);
  };

  // Client-side filtering
  const filtered = vehicles.filter((v) => {
    if (searchPlate && !v.plate.toLowerCase().includes(searchPlate.toLowerCase())) return false;
    if (filterType !== 'all' && v.type !== filterType) return false;
    if (filterStatus !== 'all' && v.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Car className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vehicles</h1>
            <p className="text-sm text-muted-foreground">
              Manage your fleet vehicles
            </p>
          </div>
        </div>
        {isManager && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Vehicle
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by plate..."
          value={searchPlate}
          onChange={(e) => setSearchPlate(e.target.value)}
          className="w-56"
        />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="van">Van</SelectItem>
            <SelectItem value="truck">Truck</SelectItem>
            <SelectItem value="motorcycle">Motorcycle</SelectItem>
            <SelectItem value="car">Car</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
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
          Failed to load vehicles.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Car className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>{vehicles.length === 0 ? 'No vehicles yet.' : 'No vehicles match filters.'}</p>
          {vehicles.length === 0 && isManager && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add your first vehicle
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Plate</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Brand / Model</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
                {isManager && <TableHead className="w-16">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((vehicle) => (
                <TableRow key={vehicle.id} className="border-border/50">
                  <TableCell className="font-mono font-medium">
                    {vehicle.plate}
                  </TableCell>
                  <TableCell className="capitalize">{vehicle.type}</TableCell>
                  <TableCell>
                    {vehicle.brand || vehicle.model ? (
                      <span>
                        {vehicle.brand ?? ''}
                        {vehicle.brand && vehicle.model ? ' ' : ''}
                        {vehicle.model ?? ''}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {vehicle.year ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {vehicle.color ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {vehicle.capacityKg != null
                      ? `${vehicle.capacityKg} kg`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_STYLES[vehicle.status] ?? STATUS_STYLES.inactive}
                    >
                      {vehicle.status === 'maintenance' && (
                        <Wrench className="w-3 h-3 mr-1" />
                      )}
                      {vehicle.status}
                    </Badge>
                  </TableCell>
                  {isManager && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(vehicle)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
