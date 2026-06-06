import { useEffect, useState } from 'react';
import { KeyRound, Eye, EyeOff, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Field,
  DenseInput,
  DialogFormFooter,
  DenseDialogHeader,
} from '@/components/ui/dense-form';
import type { Driver } from '@/types/driver.types';

interface CreateDriverLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The driver for whom the login will be created (used in the title). */
  driver: Driver | null;
  onSubmit: (data: { email: string; password: string }) => void;
  isLoading?: boolean;
}

export function CreateDriverLoginDialog({
  open,
  onOpenChange,
  driver,
  onSubmit,
  isLoading,
}: CreateDriverLoginDialogProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useTranslation('drivers');

  // Reset fields whenever the dialog opens for a (potentially different) driver.
  useEffect(() => {
    if (!open) return;
    setEmail('');
    setPassword('');
    setShowPassword(false);
  }, [open, driver?.id]);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isPasswordValid = password.length >= 8;
  const canSubmit = isEmailValid && isPasswordValid;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ email: email.trim(), password });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">
          {t('loginDialog.title', { name: driver?.name ?? '' })}
        </DialogTitle>
        <DenseDialogHeader
          icon={<KeyRound className="h-3.5 w-3.5" />}
          title={t('loginDialog.title', { name: driver?.name ?? '' })}
        />

        <div className="flex flex-col gap-[14px] px-5 py-4">
          <p className="text-[12px] text-mc-text-muted">
            {t('loginDialog.subtitle', { name: driver?.name ?? '' })}
          </p>

          <Field label={t('loginDialog.email')} required>
            <DenseInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('loginDialog.emailPlaceholder')}
              autoComplete="off"
              icon={<Mail className="h-3.5 w-3.5 text-mc-text-dim" />}
            />
          </Field>

          <Field label={t('loginDialog.password')} required>
            <div className="flex h-8 items-center gap-2 rounded-[7px] border border-border bg-mc-elev px-[10px] transition-colors focus-within:border-mc-border-strong hover:border-mc-border-strong">
              <KeyRound className="h-3.5 w-3.5 text-mc-text-dim" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('loginDialog.passwordPlaceholder')}
                autoComplete="new-password"
                className="flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-mc-text-dim"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-mc-text-dim hover:text-foreground"
                aria-label={showPassword ? t('loginDialog.hidePassword') : t('loginDialog.showPassword')}
              >
                {showPassword ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            {password.length > 0 && !isPasswordValid && (
              <p className="mt-1 text-[11px] text-mc-danger">
                {t('loginDialog.passwordMinLength')}
              </p>
            )}
          </Field>
        </div>

        <DialogFormFooter
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitLabel={isLoading ? t('loginDialog.submitting') : t('loginDialog.submit')}
          submitIcon={<KeyRound className="h-[13px] w-[13px]" />}
          canSubmit={canSubmit}
          isLoading={isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}
