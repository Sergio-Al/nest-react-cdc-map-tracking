import { cn } from '@/lib/utils';

export function ReportCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col rounded-[10px] border border-border bg-mc-elev', className)}>
      {children}
    </div>
  );
}

export function ReportCardHead({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
      <span className="text-[13px] font-semibold tracking-[-0.005em] text-foreground">{title}</span>
      {sub && <span className="ml-1 font-mono text-[11px] text-mc-text-muted">{sub}</span>}
      {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function ReportCardBody({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn('p-3.5', className)} style={style}>
      {children}
    </div>
  );
}

/** Small square icon button used in card headers. */
export function HdrIconButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded-[5px] text-mc-text-dim transition-colors hover:bg-mc-surface hover:text-foreground"
    >
      {children}
    </button>
  );
}
