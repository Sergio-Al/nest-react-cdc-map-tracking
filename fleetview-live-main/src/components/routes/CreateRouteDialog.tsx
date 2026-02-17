import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Driver } from '@/types/driver.types';

interface CreateRouteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drivers: Driver[];
  onSubmit: (driverId: string, scheduledDate: string) => void;
  isLoading?: boolean;
}

export function CreateRouteDialog({
  open,
  onOpenChange,
  drivers,
  onSubmit,
  isLoading,
}: CreateRouteDialogProps) {
  const [driverId, setDriverId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const handleSubmit = () => {
    if (!driverId || !scheduledDate) return;
    onSubmit(driverId, scheduledDate);
    setDriverId('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Route</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Driver</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a driver" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} {d.vehiclePlate ? `(${d.vehiclePlate})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Scheduled Date</Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!driverId || !scheduledDate || isLoading}>
            <Plus className="w-4 h-4 mr-1" />
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
