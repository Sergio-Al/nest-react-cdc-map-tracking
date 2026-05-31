import { useState } from 'react';
import { Plus, Car } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Field,
  DenseInput,
  ChipGroup,
  DialogFormFooter,
  DenseDialogHeader,
} from '@/components/ui/dense-form';
import type { CreateVehicleDto } from '@/hooks/api/useVehicles';

interface CreateVehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (dto: CreateVehicleDto) => void;
  isLoading?: boolean;
}

const TYPES = [
  { id: 'van', label: 'Van' },
  { id: 'truck', label: 'Truck' },
  { id: 'motorcycle', label: 'Moto' },
  { id: 'car', label: 'Car' },
];

export function CreateVehicleDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: CreateVehicleDialogProps) {
  const [plate, setPlate] = useState('');
  const [type, setType] = useState('van');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [capacityKg, setCapacityKg] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setPlate('');
    setType('van');
    setBrand('');
    setModel('');
    setYear('');
    setColor('');
    setCapacityKg('');
    setNotes('');
  };

  const handleSubmit = () => {
    if (!plate.trim()) return;
    onSubmit({
      plate: plate.trim(),
      type,
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      year: year ? parseInt(year, 10) : undefined,
      color: color.trim() || undefined,
      capacityKg: capacityKg ? parseFloat(capacityKg) : undefined,
      notes: notes.trim() || undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-[480px] gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">New Vehicle</DialogTitle>
        <DenseDialogHeader icon={<Car className="h-3.5 w-3.5" />} title="New Vehicle" />

        <div className="flex max-h-[70vh] flex-col gap-[14px] overflow-y-auto px-5 py-4">
          <Field label="Plate" required>
            <DenseInput
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="ABC-1234"
              className="font-mono"
            />
          </Field>

          <Field label="Type">
            <ChipGroup value={type} onChange={setType} options={TYPES} />
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Brand">
              <DenseInput
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Mercedes-Benz"
              />
            </Field>
            <Field label="Model">
              <DenseInput
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Sprinter"
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <Field label="Year">
              <DenseInput
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2024"
              />
            </Field>
            <Field label="Color">
              <DenseInput
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="White"
              />
            </Field>
            <Field label="Capacity (kg)">
              <DenseInput
                type="number"
                value={capacityKg}
                onChange={(e) => setCapacityKg(e.target.value)}
                placeholder="1500"
              />
            </Field>
          </div>

          <Field label="Notes">
            <DenseInput
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes…"
            />
          </Field>
        </div>

        <DialogFormFooter
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitLabel="Create"
          submitIcon={<Plus className="h-[13px] w-[13px]" />}
          canSubmit={!!plate.trim()}
          isLoading={isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}
