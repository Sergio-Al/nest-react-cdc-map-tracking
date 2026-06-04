import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { useRoutes } from '@/hooks/api/useRoutes';
import { busyDriverIds } from '@/lib/routeAssignment';
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
  const { t } = useTranslation('routes');
  const { data: routes = [] } = useRoutes();

  // Hide drivers who already have a (non-cancelled) route on the chosen date.
  const availableDrivers = useMemo(() => {
    const busy = busyDriverIds(routes, scheduledDate);
    return drivers.filter((d) => !busy.has(d.id));
  }, [drivers, routes, scheduledDate]);

  // If the date change makes the picked driver unavailable, clear the selection.
  useEffect(() => {
    if (driverId && !availableDrivers.some((d) => d.id === driverId)) setDriverId('');
  }, [availableDrivers, driverId]);

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
          <DialogTitle>{t('createDialog.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('createDialog.driver')}</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger>
                <SelectValue placeholder={t('createDialog.driverPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {availableDrivers.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    {t('createDialog.noAvailableDrivers')}
                  </div>
                ) : (
                  availableDrivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} {d.vehiclePlate ? `(${d.vehiclePlate})` : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('createDialog.scheduledDate')}</Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('createDialog.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!driverId || !scheduledDate || isLoading}>
            <Plus className="w-4 h-4 mr-1" />
            {t('createDialog.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
