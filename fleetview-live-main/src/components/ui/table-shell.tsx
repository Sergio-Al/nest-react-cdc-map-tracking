import { Download, Loader2, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Header {
  label: string;
  num?: boolean;
}

interface TableShellProps {
  headers: Header[];
  count: number;
  isLoading: boolean;
  emptyMessage: string;
  onExport?: () => void;
  exportLabel?: (count: number) => string;
  children: React.ReactNode;
}

export function TableShell({
  headers,
  count,
  isLoading,
  emptyMessage,
  onExport,
  exportLabel,
  children,
}: TableShellProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-6 py-2 text-xs text-mc-text-muted">
        Showing <span className="font-mono font-semibold text-foreground">{count}</span> records
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="ml-auto inline-flex h-[26px] items-center gap-1.5 rounded-md border border-border bg-mc-elev px-2 text-[11.5px] font-medium text-foreground hover:border-mc-border-strong"
          >
            <Download className="h-3 w-3" />
            {exportLabel ? exportLabel(count) : `Export ${count} rows`}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-mc-text-dim" />
        </div>
      ) : count === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-[14px] border border-border bg-mc-surface text-mc-text-dim">
            <Inbox className="h-[22px] w-[22px]" />
          </div>
          <div className="text-sm text-mc-text-muted">{emptyMessage}</div>
        </div>
      ) : (
        <div className="relative flex-1 overflow-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className={cn(
                      'sticky top-0 z-[2] whitespace-nowrap border-b border-border bg-background px-3.5 py-[9px] text-[11px] font-medium text-mc-text-muted',
                      h.num ? 'text-right font-mono' : 'text-left',
                    )}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface TdProps {
  children: React.ReactNode;
  num?: boolean;
  muted?: boolean;
  className?: string;
}

export function Td({ children, num, muted, className }: TdProps) {
  return (
    <td
      className={cn(
        'border-b border-border/60 px-3.5 py-[var(--mc-row-py)]',
        num && 'text-right font-mono',
        muted && 'text-mc-text-muted',
        className,
      )}
    >
      {children}
    </td>
  );
}
