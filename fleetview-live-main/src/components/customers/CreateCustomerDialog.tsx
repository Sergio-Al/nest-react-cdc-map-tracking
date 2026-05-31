import { useState } from 'react';
import { Plus, Building2, Phone, Mail, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { LocationPickerMap } from '@/components/ui/location-picker-map';
import {
  Field,
  DenseInput,
  ChipGroup,
  DialogFormFooter,
  DenseDialogHeader,
} from '@/components/ui/dense-form';
import type { CreateCustomerDto } from '@/hooks/api/useRouteBuilder';

interface CreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  onSubmit: (dto: CreateCustomerDto) => void;
  isLoading?: boolean;
}

const TYPE_IDS = ['retail', 'wholesale', 'distributor', 'other'] as const;

export function CreateCustomerDialog({
  open,
  onOpenChange,
  tenantId,
  onSubmit,
  isLoading,
}: CreateCustomerDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [geofenceRadius, setGeofenceRadius] = useState(100);
  const [customerType, setCustomerType] = useState('retail');
  const { t } = useTranslation('customers');

  const types = TYPE_IDS.map((id) => ({ id, label: t(`dialog.types.${id}`) }));

  const reset = () => {
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setLat(null);
    setLng(null);
    setGeofenceRadius(100);
    setCustomerType('retail');
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      tenantId,
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      latitude: lat ?? undefined,
      longitude: lng ?? undefined,
      geofenceRadiusMeters: geofenceRadius,
      customerType,
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
      <DialogContent className="max-w-[520px] gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('dialog.title')}</DialogTitle>
        <DenseDialogHeader icon={<Building2 className="h-3.5 w-3.5" />} title={t('dialog.title')} />

        <div className="flex max-h-[70vh] flex-col gap-[14px] overflow-y-auto px-5 py-4">
          <Field label={t('dialog.name')} required>
            <DenseInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('dialog.namePlaceholder')}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t('dialog.phone')}>
              <DenseInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('dialog.phonePlaceholder')}
                icon={<Phone className="h-3.5 w-3.5 text-mc-text-dim" />}
              />
            </Field>
            <Field label={t('dialog.email')}>
              <DenseInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('dialog.emailPlaceholder')}
                icon={<Mail className="h-3.5 w-3.5 text-mc-text-dim" />}
              />
            </Field>
          </div>

          <Field label={t('dialog.address')}>
            <DenseInput
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('dialog.addressPlaceholder')}
              icon={<MapPin className="h-3.5 w-3.5 text-mc-text-dim" />}
            />
          </Field>

          <Field label={t('dialog.location')}>
            <LocationPickerMap
              lat={lat}
              lng={lng}
              radiusMeters={geofenceRadius}
              onChange={(la, ln) => {
                setLat(la);
                setLng(ln);
              }}
              height={200}
            />
            <div className="mt-1.5 flex items-center justify-between font-mono text-[10.5px] text-mc-text-dim">
              <span>
                {lat != null && lng != null
                  ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                  : t('dialog.noPinYet')}
              </span>
              <span>{t('dialog.geofenceLabel', { value: geofenceRadius })}</span>
            </div>
          </Field>

          <Field label={t('dialog.geofenceField')}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={50}
                max={1000}
                step={10}
                value={geofenceRadius}
                onChange={(e) => setGeofenceRadius(Number(e.target.value))}
                className="flex-1 accent-[color:var(--mc-accent)]"
              />
              <span className="w-[60px] text-right font-mono text-[12px] text-foreground">
                {geofenceRadius} m
              </span>
            </div>
          </Field>

          <Field label={t('dialog.customerType')}>
            <ChipGroup value={customerType} onChange={setCustomerType} options={types} />
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
