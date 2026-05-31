import { Check, MoreHorizontal, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { avatarTone, statusPill, barColor, toneForPct } from './tones';
import { ROUTE_COLUMNS, type SortCol, type SortState } from './routeColumns';
import type { RouteReportRow } from '@/hooks/api/useReports';

function SortHead({
  col,
  label,
  num,
  sort,
  onSort,
}: {
  col: SortCol;
  label: string;
  num?: boolean;
  sort: SortState;
  onSort: (c: SortCol) => void;
}) {
  const active = sort.col === col;
  return (
    <th
      className={cn(
        'sticky top-0 z-[2] whitespace-nowrap border-b border-border bg-background px-3.5 py-[9px] text-[11px] font-medium text-mc-text-muted',
        num ? 'text-right' : 'text-left',
      )}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground',
          num && 'flex-row-reverse',
          active && 'text-foreground',
        )}
      >
        {label}
        {active &&
          (sort.dir === 'desc' ? (
            <ChevronDown className="h-3 w-3 text-mc-accent" />
          ) : (
            <ChevronUp className="h-3 w-3 text-mc-accent" />
          ))}
      </button>
    </th>
  );
}

function Checkbox({ on }: { on: boolean }) {
  return (
    <div
      className={cn(
        'grid h-3.5 w-3.5 place-items-center rounded border-[1.5px]',
        on
          ? 'border-mc-accent bg-mc-accent text-mc-accent-fg'
          : 'border-mc-border-strong bg-mc-elev text-transparent',
      )}
    >
      {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
    </div>
  );
}

export function RoutesTable({
  rows,
  density,
  sort,
  onSort,
  visible,
  selectedIds,
  onToggle,
  onToggleAll,
  allSelected,
  drillId,
  onRowClick,
}: {
  rows: RouteReportRow[];
  density: 'cozy' | 'dense';
  sort: SortState;
  onSort: (c: SortCol) => void;
  visible: Set<SortCol>;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  drillId: string | null;
  onRowClick: (id: string) => void;
}) {
  const pad = density === 'dense' ? 'py-1.5' : 'py-[9px]';
  const show = (col: SortCol) => visible.has(col);
  return (
    <div className="relative flex-1 overflow-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            <th className="sticky top-0 z-[2] w-7 border-b border-border bg-background py-[9px] pl-3.5">
              <button type="button" onClick={onToggleAll} aria-label="Select all">
                <Checkbox on={allSelected} />
              </button>
            </th>
            {ROUTE_COLUMNS.filter((c) => show(c.id)).map((c) => (
              <SortHead key={c.id} col={c.id} label={c.label} num={c.num} sort={sort} onSort={onSort} />
            ))}
            <th className="sticky top-0 z-[2] w-8 border-b border-border bg-background" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const sel = selectedIds.has(r.id) || drillId === r.id;
            const tone = r.status === 'missed' ? 'red' : toneForPct(r.onTimePct);
            return (
              <tr
                key={r.id}
                onClick={() => onRowClick(r.id)}
                className={cn(
                  'cursor-pointer border-b border-border/60 transition-colors',
                  sel ? 'bg-mc-accent-soft' : 'hover:bg-mc-surface',
                )}
              >
                <td
                  className={cn('pl-3.5', pad)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(r.id);
                  }}
                >
                  <Checkbox on={selectedIds.has(r.id)} />
                </td>
                {show('date') && <td className={cn('px-3.5 font-mono text-xs', pad)}>{r.dateLabel}</td>}
                {show('driver') && (
                  <td className={cn('px-3.5', pad)}>
                    <span className="inline-flex items-center gap-[7px]">
                      <span
                        className={cn(
                          'grid h-[22px] w-[22px] place-items-center rounded-full font-mono text-[9.5px] font-bold',
                          avatarTone(tone),
                        )}
                      >
                        {r.initials}
                      </span>
                      <span className="text-foreground">{r.driverName}</span>
                    </span>
                  </td>
                )}
                {show('vehicle') && (
                  <td className={cn('px-3.5 font-mono text-[11.5px] text-mc-text-muted', pad)}>
                    {r.plate}
                  </td>
                )}
                {show('status') && (
                  <td className={cn('px-3.5', pad)}>
                    <span
                      className={cn(
                        'inline-flex h-[19px] items-center gap-1 rounded-full px-[7px] font-mono text-[10.5px] font-semibold',
                        statusPill(r.status),
                      )}
                    >
                      <span className="h-[5px] w-[5px] rounded-full bg-current" />
                      {r.status === 'in_progress' ? 'in progress' : r.status}
                    </span>
                  </td>
                )}
                {show('visits') && <td className={cn('px-3.5 text-right font-mono', pad)}>{r.stopsLabel}</td>}
                {show('distance') && (
                  <td className={cn('px-3.5 text-right font-mono', pad)}>
                    {r.distanceKm != null ? r.distanceKm.toFixed(1) : '—'}
                  </td>
                )}
                {show('duration') && (
                  <td className={cn('px-3.5 text-right font-mono', pad)}>{r.durationLabel}</td>
                )}
                {show('otp') && (
                  <td className={cn('px-3.5', pad)}>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="relative h-[5px] w-[60px] overflow-hidden rounded-full bg-mc-surface">
                        <span
                          className="absolute inset-y-0 left-0"
                          style={{ width: `${r.onTimePct}%`, background: barColor(tone) }}
                        />
                      </span>
                      <span className="text-foreground">{r.onTimePct}%</span>
                    </span>
                  </td>
                )}
                <td className={cn('px-2', pad)}>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="grid h-[22px] w-[22px] place-items-center rounded-[5px] text-mc-text-dim transition-colors hover:bg-mc-surface hover:text-foreground"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
