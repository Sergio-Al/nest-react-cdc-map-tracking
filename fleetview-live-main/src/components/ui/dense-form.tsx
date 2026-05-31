import { cn } from '@/lib/utils';

export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </div>
      {children}
    </div>
  );
}

interface DenseInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export function DenseInput({ icon, className, ...props }: DenseInputProps) {
  return (
    <div className="flex h-8 items-center gap-2 rounded-[7px] border border-border bg-mc-elev px-[10px] transition-colors focus-within:border-mc-border-strong hover:border-mc-border-strong">
      {icon}
      <input
        {...props}
        className={cn(
          'flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-mc-text-dim',
          className,
        )}
      />
    </div>
  );
}

interface ChipGroupProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: { id: T; label: string }[];
  columns?: number;
}

export function ChipGroup<T extends string>({
  value,
  onChange,
  options,
  columns,
}: ChipGroupProps<T>) {
  return (
    <div
      className="grid gap-[2px] rounded-[8px] border border-border bg-mc-surface p-[3px]"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            'flex h-[26px] items-center justify-center rounded-[6px] text-[12px] font-medium transition-colors',
            value === opt.id
              ? 'bg-mc-elev text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.06),0_0_0_1px_var(--mc-border)]'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function DialogFormFooter({
  onCancel,
  onSubmit,
  submitLabel = 'Save',
  submitIcon,
  canSubmit = true,
  isLoading,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitIcon?: React.ReactNode;
  canSubmit?: boolean;
  isLoading?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border bg-background px-5 py-3">
      <button
        type="button"
        onClick={onCancel}
        className="flex h-8 items-center rounded-mc border border-border bg-mc-elev px-3 text-[12px] font-medium text-muted-foreground hover:bg-mc-surface hover:text-foreground"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit || isLoading}
        className={cn(
          'flex h-8 items-center gap-[6px] rounded-mc px-3 text-[12px] font-medium transition-colors',
          canSubmit && !isLoading
            ? 'bg-mc-accent text-white hover:bg-mc-accent-strong'
            : 'cursor-not-allowed bg-mc-surface text-mc-text-dim',
        )}
      >
        {submitIcon}
        <span>{isLoading ? 'Saving…' : submitLabel}</span>
      </button>
    </div>
  );
}

export function DenseDialogHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-5 py-4 text-[14px] font-semibold tracking-[-0.005em]">
      <span className="grid h-7 w-7 place-items-center rounded-lg border border-mc-accent-border bg-mc-accent-soft text-mc-accent">
        {icon}
      </span>
      {title}
    </div>
  );
}
