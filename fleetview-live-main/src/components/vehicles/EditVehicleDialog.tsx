import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Field,
  DenseInput,
  ChipGroup,
  DialogFormFooter,
  DenseDialogHeader,
} from '@/components/ui/dense-form';
import type { Vehicle } from '@/types/vehicle.types';
import type { UpdateVehicleDto } from '@/hooks/api/useVehicles';

interface EditVehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null;
  onSubmit: (id: string, dto: UpdateVehicleDto) => void;
  isLoading?: boolean;
}

const TYPE_IDS = ['van', 'truck', 'motorcycle', 'car'] as const;
const STATUS_IDS = ['active', 'maintenance', 'inactive'] as const;

export function EditVehicleDialog({
  open,
  onOpenChange,
  vehicle,
  onSubmit,
  isLoading,
}: EditVehicleDialogProps) {
  const [plate, setPlate] = useState('');
  const [type, setType] = useState('van');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [capacityKg, setCapacityKg] = useState('');
  const [status, setStatus] = useState('active');
  const [notes, setNotes] = useState('');
  const { t } = useTranslation('vehicles');

  const types = TYPE_IDS.map((id) => ({ id, label: t(`dialog.types.${id}`) }));
  const statuses = STATUS_IDS.map((id) => ({ id, label: t(`dialog.statuses.${id}`) }));

  useEffect(() => {
    if (vehicle) {
      setPlate(vehicle.plate);
      setType(vehicle.type);
      setBrand(vehicle.brand ?? '');
      setModel(vehicle.model ?? '');
      setYear(vehicle.year?.toString() ?? '');
      setColor(vehicle.color ?? '');
      setCapacityKg(vehicle.capacityKg?.toString() ?? '');
      setStatus(vehicle.status);
      setNotes(vehicle.notes ?? '');
    }
  }, [vehicle]);

  const handleSubmit = () => {
    if (!vehicle || !plate.trim()) return;
    onSubmit(vehicle.id, {
      plate: plate.trim(),
      type,
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      year: year ? parseInt(year, 10) : undefined,
      color: color.trim() || undefined,
      capacityKg: capacityKg ? parseFloat(capacityKg) : undefined,
      status,
      notes: notes.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('dialog.editTitle')}</DialogTitle>
        <DenseDialogHeader icon={<Pencil className="h-3.5 w-3.5" />} title={t('dialog.editTitle')} />

        <div className="flex max-h-[70vh] flex-col gap-[14px] overflow-y-auto px-5 py-4">
          <Field label={t('dialog.plate')} required>
            <DenseInput
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              className="font-mono"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t('dialog.type')}>
              <ChipGroup value={type} onChange={setType} options={types} />
            </Field>
            <Field label={t('dialog.statusLabel')}>
              <ChipGroup value={status} onChange={setStatus} options={statuses} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t('dialog.brand')}>
              <DenseInput value={brand} onChange={(e) => setBrand(e.target.value)} />
            </Field>
            <Field label={t('dialog.model')}>
              <DenseInput value={model} onChange={(e) => setModel(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <Field label={t('dialog.year')}>
              <DenseInput type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            </Field>
            <Field label={t('dialog.color')}>
              <DenseInput value={color} onChange={(e) => setColor(e.target.value)} />
            </Field>
            <Field label={t('dialog.capacityKg')}>
              <DenseInput
                type="number"
                value={capacityKg}
                onChange={(e) => setCapacityKg(e.target.value)}
              />
            </Field>
          </div>

          <Field label={t('dialog.notes')}>
            <DenseInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <DialogFormFooter
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitLabel={t('dialog.save')}
          canSubmit={!!plate.trim()}
          isLoading={isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}
