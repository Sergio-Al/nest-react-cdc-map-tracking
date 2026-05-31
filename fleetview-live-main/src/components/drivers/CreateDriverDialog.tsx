import { useState } from 'react';
import { Plus, Users, Phone, Hash, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Field,
  DenseInput,
  ChipGroup,
  DialogFormFooter,
  DenseDialogHeader,
} from '@/components/ui/dense-form';
import type { CreateDriverDto } from '@/hooks/api/useDrivers';

interface CreateDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  onSubmit: (dto: CreateDriverDto) => void;
  isLoading?: boolean;
}

const VEHICLE_TYPE_IDS = ['van', 'truck', 'motorcycle', 'car'] as const;

export function CreateDriverDialog({
  open,
  onOpenChange,
  tenantId,
  onSubmit,
  isLoading,
}: CreateDriverDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState('van');
  const [deviceId, setDeviceId] = useState('');
  const { t } = useTranslation('drivers');

  const vehicleTypes = VEHICLE_TYPE_IDS.map((id) => ({ id, label: t(`dialog.types.${id}`) }));

  const reset = () => {
    setName('');
    setPhone('');
    setVehiclePlate('');
    setVehicleType('van');
    setDeviceId('');
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      tenantId,
      name: name.trim(),
      phone: phone.trim() || undefined,
      vehiclePlate: vehiclePlate.trim() || undefined,
      vehicleType,
      deviceId: deviceId.trim() || undefined,
      status: 'offline',
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
      <DialogContent className="max-w-[440px] gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('dialog.title')}</DialogTitle>
        <DenseDialogHeader icon={<Users className="h-3.5 w-3.5" />} title={t('dialog.title')} />

        <div className="flex max-h-[70vh] flex-col gap-[14px] overflow-y-auto px-5 py-4">
          <Field label={t('dialog.name')} required>
            <DenseInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('dialog.namePlaceholder')}
            />
          </Field>

          <Field label={t('dialog.phone')}>
            <DenseInput
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('dialog.phonePlaceholder')}
              icon={<Phone className="h-3.5 w-3.5 text-mc-text-dim" />}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t('dialog.vehiclePlate')}>
              <DenseInput
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                placeholder="ABC-123"
                className="font-mono"
                icon={<Truck className="h-3.5 w-3.5 text-mc-text-dim" />}
              />
            </Field>
            <Field label={t('dialog.deviceId')}>
              <DenseInput
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="DEV001"
                className="font-mono"
                icon={<Hash className="h-3.5 w-3.5 text-mc-text-dim" />}
              />
            </Field>
          </div>

          <Field label={t('dialog.vehicleType')}>
            <ChipGroup value={vehicleType} onChange={setVehicleType} options={vehicleTypes} />
          </Field>
        </div>

        <DialogFormFooter
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitLabel={t('dialog.create')}
          submitIcon={<Plus className="h-[13px] w-[13px]" />}
          canSubmit={!!name.trim()}
          isLoading={isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}
