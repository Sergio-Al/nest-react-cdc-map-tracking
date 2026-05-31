import { CircleDashed, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DirectoryDetailTab {
  id: string;
  label: string;
  count?: number;
}

interface DirectoryDetailPanelProps {
  isEmpty?: boolean;
  emptyTitle?: string;
  emptySubtitle?: string;

  icon?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;

  tabs?: DirectoryDetailTab[];
  activeTabId?: string;
  onTabChange?: (id: string) => void;

  onClose?: () => void;

  className?: string;
  children?: ReactNode;
}

export function DirectoryDetailPanel({
  isEmpty,
  emptyTitle = 'Nothing selected',
  emptySubtitle = 'Pick a row from the list to see its details here.',
  icon,
  title,
  subtitle,
  status,
  actions,
  tabs,
  activeTabId,
  onTabChange,
  onClose,
  className,
  children,
}: DirectoryDetailPanelProps) {
  if (isEmpty) {
    return (
      <aside
        className={cn(
          'flex w-[340px] shrink-0 flex-col border-l border-border bg-background',
          className,
        )}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-[10px] p-8 text-center">
          <div className="grid h-11 w-11 place-items-center rounded-[12px] border border-border bg-mc-surface text-mc-text-dim">
            <CircleDashed className="h-5 w-5" />
          </div>
          <div className="mt-1 text-[13px] font-semibold text-foreground">{emptyTitle}</div>
          <div className="max-w-[220px] text-[11.5px] leading-relaxed text-muted-foreground">
            {emptySubtitle}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        'flex w-[340px] shrink-0 flex-col border-l border-border bg-background',
        className,
      )}
    >
      {/* Head */}
      <div className="border-b border-border px-4 py-[14px]">
        <div className="flex items-center gap-[9px]">
          {icon && <span className="shrink-0">{icon}</span>}
          <div className="min-w-0 flex-1">
            {title && <div className="truncate text-[13px] font-semibold">{title}</div>}
            {subtitle && (
              <div className="mt-px truncate font-mono text-[11px] text-mc-text-dim">{subtitle}</div>
            )}
          </div>
          {status}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-mc-text-dim transition-colors hover:bg-mc-surface hover:text-foreground"
            >
              <X className="h-[14px] w-[14px]" />
            </button>
          )}
        </div>

        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>

      {/* Tabs */}
      {tabs && tabs.length > 0 && (
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange?.(tab.id)}
              className={cn(
                'flex h-9 items-center gap-1.5 px-4 text-[12px] font-medium transition-colors',
                activeTabId === tab.id
                  ? 'border-b-2 border-mc-accent text-mc-accent'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="font-mono text-[10px] text-mc-text-dim">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
