import { useState } from 'react';
import { Plus, Building2, Phone, Mail, MapPin } from 'lucide-react';
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

const TYPES = [
  { id: 'retail', label: 'Retail' },
  { id: 'wholesale', label: 'Wholesale' },
  { id: 'distributor', label: 'Distributor' },
  { id: 'other', label: 'Other' },
];

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
        <DialogTitle className="sr-only">New Customer</DialogTitle>
        <DenseDialogHeader icon={<Building2 className="h-3.5 w-3.5" />} title="New Customer" />

        <div className="flex max-h-[70vh] flex-col gap-[14px] overflow-y-auto px-5 py-4">
          <Field label="Name" required>
            <DenseInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer or business name"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Phone">
              <DenseInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+591 …"
                icon={<Phone className="h-3.5 w-3.5 text-mc-text-dim" />}
              />
            </Field>
            <Field label="Email">
              <DenseInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@example.com"
                icon={<Mail className="h-3.5 w-3.5 text-mc-text-dim" />}
              />
            </Field>
          </div>

          <Field label="Address">
            <DenseInput
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address"
              icon={<MapPin className="h-3.5 w-3.5 text-mc-text-dim" />}
            />
          </Field>

          <Field label="Location · click on the map to place the pin">
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
                  : 'no pin yet'}
              </span>
              <span>geofence {geofenceRadius} m</span>
            </div>
          </Field>

          <Field label="Geofence radius">
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

          <Field label="Customer type">
            <ChipGroup value={customerType} onChange={setCustomerType} options={TYPES} />
          </Field>
        </div>

        <DialogFormFooter
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitLabel="Create"
          submitIcon={<Plus className="h-[13px] w-[13px]" />}
          canSubmit={!!name.trim()}
          isLoading={isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}
