import { useState } from 'react';
import { Plus, ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Field,
  DenseInput,
  ChipGroup,
  DialogFormFooter,
  DenseDialogHeader,
} from '@/components/ui/dense-form';
import { useCustomers } from '@/hooks/api/useRouteBuilder';
import type { CreateOrderDto } from '@/types/order.types';

interface CreateOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  onSubmit: (dto: CreateOrderDto) => void;
  isLoading?: boolean;
}

const STATUS_IDS = ['pending', 'confirmed', 'in_transit', 'completed', 'cancelled'] as const;

export function CreateOrderDialog({
  open,
  onOpenChange,
  tenantId,
  onSubmit,
  isLoading,
}: CreateOrderDialogProps) {
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [orderNumber, setOrderNumber] = useState('');
  const [status, setStatus] = useState('pending');
  const [totalAmount, setTotalAmount] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');

  const { t } = useTranslation('orders');
  const { data: customers = [] } = useCustomers();

  const statusOptions = STATUS_IDS.map((id) => ({ id, label: t(`dialog.statusOptions.${id}`) }));

  const reset = () => {
    setCustomerId('');
    setOrderNumber('');
    setStatus('pending');
    setTotalAmount('');
    setDeliveryDate('');
    setNotes('');
  };

  const handleSubmit = () => {
    if (!customerId) return;
    onSubmit({
      tenantId,
      customerId: Number(customerId),
      orderNumber: orderNumber.trim() || undefined,
      status,
      totalAmount: totalAmount ? Number(totalAmount) : undefined,
      deliveryDate: deliveryDate || undefined,
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
      <DialogContent className="max-w-[520px] gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('dialog.title')}</DialogTitle>
        <DenseDialogHeader icon={<ShoppingCart className="h-3.5 w-3.5" />} title={t('dialog.title')} />

        <div className="flex max-h-[70vh] flex-col gap-[14px] overflow-y-auto px-5 py-4">
          <Field label={t('dialog.customer')} required>
            <div className="flex h-8 items-center gap-2 rounded-[7px] border border-border bg-mc-elev px-[10px] transition-colors focus-within:border-mc-border-strong hover:border-mc-border-strong">
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
                className="flex-1 bg-transparent text-[12.5px] text-foreground outline-none"
              >
                <option value="">{t('dialog.customerPlaceholder')}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t('dialog.orderNumber')}>
              <DenseInput
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder={t('dialog.orderNumberPlaceholder')}
              />
            </Field>
            <Field label={t('dialog.totalAmount')}>
              <DenseInput
                type="number"
                min={0}
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder={t('dialog.totalAmountPlaceholder')}
              />
            </Field>
          </div>

          <Field label={t('dialog.deliveryDate')}>
            <DenseInput
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </Field>

          <Field label={t('dialog.status')}>
            <ChipGroup
              value={status}
              onChange={setStatus}
              options={statusOptions}
              columns={3}
            />
          </Field>

          <Field label={t('dialog.notes')}>
            <div className="rounded-[7px] border border-border bg-mc-elev px-[10px] py-[6px] transition-colors focus-within:border-mc-border-strong hover:border-mc-border-strong">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('dialog.notesPlaceholder')}
                rows={3}
                className="w-full resize-none bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-mc-text-dim"
              />
            </div>
          </Field>
        </div>

        <DialogFormFooter
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitLabel={t('dialog.create')}
          submitIcon={<Plus className="h-[13px] w-[13px]" />}
          canSubmit={!!customerId}
          isLoading={isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}
