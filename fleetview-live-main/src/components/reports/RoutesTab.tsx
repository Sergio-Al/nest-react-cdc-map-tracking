import { useCallback, useMemo, useState } from 'react';
import {
  Columns3,
  Rows3,
  Rows4,
  Download,
  ChevronDown,
  Inbox,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { exportToCsv } from '@/lib/utils';
import { RoutesTable } from './RoutesTable';
import { ROUTE_COLUMNS, type SortCol, type SortState } from './routeColumns';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DrillPanel } from './DrillPanel';
import { FilterBar, useDatasetFilters } from '@/components/filters';
import { ROUTE_FIELDS, ROUTE_VIEWS } from './reportFilters';
import { useRouteReport, type RouteReportRow } from '@/hooks/api/useReports';
import { useReportsStore } from '@/stores/reports.store';
import { useRegisterExporter } from '@/hooks/useReportExporter';

const PAGE_SIZE = 15;

function parseDur(label: string): number {
  const m = label.match(/(\d+)h\s*(\d+)m/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

function sortRows(rows: RouteReportRow[], sort: SortState): RouteReportRow[] {
  const key = (r: RouteReportRow): string | number => {
    switch (sort.col) {
      case 'date':
        return r.scheduledDate;
      case 'driver':
        return r.driverName;
      case 'vehicle':
        return r.plate;
      case 'status':
        return r.status;
      case 'visits':
        return r.completedStops;
      case 'distance':
        return r.distanceKm ?? -1;
      case 'duration':
        return parseDur(r.durationLabel);
      case 'otp':
        return r.onTimePct;
    }
  };
  const sorted = [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });
  return sort.dir === 'desc' ? sorted.reverse() : sorted;
}

export function RoutesTab() {
  const { from, to } = useReportsStore();
  const { rows, isLoading, isMock } = useRouteReport(from, to);
  const { t, i18n } = useTranslation('reports');

  const ds = useDatasetFilters('routes', rows, ROUTE_FIELDS, ROUTE_VIEWS);
  const [sort, setSort] = useState<SortState>({ col: 'date', dir: 'desc' });
  const [density, setDensity] = useState<'cozy' | 'dense'>('cozy');
  const [visibleCols, setVisibleCols] = useState<Set<SortCol>>(
    () => new Set(ROUTE_COLUMNS.map((c) => c.id)),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drillId, setDrillId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => sortRows(ds.filtered, sort), [ds.filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const allSelected = pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id));

  const onSort = (col: SortCol) =>
    setSort((s) => (s.col === col ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' }));

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) pageRows.forEach((r) => next.delete(r.id));
      else pageRows.forEach((r) => next.add(r.id));
      return next;
    });

  const toggleCol = (id: SortCol) =>
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearFilters = () => ds.updateFilters([]);

  const doExport = useCallback(() => {
    if (sorted.length === 0) {
      toast.info(t('exportToasts.noRoutes'));
      return;
    }
    exportToCsv(
      sorted.map((r) => ({
        [t('csvHeaders.date')]: r.dateLabel,
        [t('csvHeaders.driver')]: r.driverName,
        [t('csvHeaders.vehicle')]: r.plate,
        [t('csvHeaders.status')]: r.status,
        [t('csvHeaders.stops')]: r.stopsLabel,
        [t('csvHeaders.distanceKm')]: r.distanceKm?.toFixed(1) ?? '',
        [t('csvHeaders.duration')]: r.durationLabel,
        [t('csvHeaders.ontimePct')]: r.onTimePct,
      })),
      t('csvHeaders.rutas'),
    );
    toast.success(t('exportToasts.exportedRoutes', { count: sorted.length }));
  }, [sorted, t]);
  useRegisterExporter(doExport);

  const dense = drillId ? 'dense' : density;
  const empty = !isLoading && sorted.length === 0;
  const drillRow = drillId ? rows.find((r) => r.id === drillId) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar
        fields={ROUTE_FIELDS}
        rows={rows}
        filters={ds.filters}
        onChange={ds.updateFilters}
        views={ds.views}
        activeViewId={ds.activeViewId}
        onSelectView={ds.selectView}
        onSaveView={ds.saveView}
        onDeleteView={ds.deleteView}
        isMock={isMock}
      />

      {/* Table actions */}
      <div className="flex items-center gap-1.5 border-b border-border px-6 py-2 text-xs text-mc-text-muted">
        <span
          dangerouslySetInnerHTML={{
            __html: t('table.showingOfRoutes', {
              shown: `<span class="font-mono font-semibold text-foreground">${pageRows.length}</span>`,
              total: `<span class="font-mono font-semibold text-foreground">${sorted.length}</span>`,
              interpolation: { escapeValue: false },
            }),
          }}
        />
        <div className="ml-auto flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-[26px] items-center gap-1.5 rounded-md border border-border bg-mc-elev px-2 text-[11.5px] font-medium text-foreground hover:border-mc-border-strong"
              >
                <Columns3 className="h-3 w-3" />
                {t('table.columns')}
                <span className="font-mono text-[10px] text-mc-text-dim">
                  {visibleCols.size}/{ROUTE_COLUMNS.length}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-[11px] font-normal text-mc-text-dim">
                {t('table.toggleColumns')}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ROUTE_COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  className="text-xs"
                  checked={visibleCols.has(c.id)}
                  disabled={c.locked}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => !c.locked && toggleCol(c.id)}
                >
                  {t(`columns.${c.id}`)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="inline-flex rounded-md border border-border bg-mc-surface p-0.5">
            <button
              type="button"
              onClick={() => setDensity('cozy')}
              title={t('table.density.cozy')}
              className={cn(
                'grid h-[22px] w-[26px] place-items-center rounded-[4px]',
                density === 'cozy' ? 'bg-mc-elev text-foreground shadow-sm' : 'text-mc-text-dim hover:text-foreground',
              )}
            >
              <Rows3 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setDensity('dense')}
              title={t('table.density.dense')}
              className={cn(
                'grid h-[22px] w-[26px] place-items-center rounded-[4px]',
                density === 'dense' ? 'bg-mc-elev text-foreground shadow-sm' : 'text-mc-text-dim hover:text-foreground',
              )}
            >
              <Rows4 className="h-3 w-3" />
            </button>
          </div>
          <button
            type="button"
            onClick={doExport}
            className="inline-flex h-[26px] items-center gap-1.5 rounded-md border border-border bg-mc-elev px-2 text-[11.5px] font-medium text-foreground hover:border-mc-border-strong"
          >
            <Download className="h-3 w-3" />
            {t('table.exportRows', { count: sorted.length })}
          </button>
        </div>
      </div>

      {/* Body: table (+ drill panel) or empty */}
      <div className="flex min-h-0 flex-1">
        {empty ? (
          <div className="flex flex-1 flex-col">
            <div className="mx-auto my-16 flex max-w-[480px] flex-col items-center gap-3 rounded-xl border border-dashed border-mc-border-strong bg-mc-elev p-8 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-[14px] border border-border bg-mc-surface text-mc-text-dim">
                <Inbox className="h-[22px] w-[22px]" />
              </div>
              <div className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                {t('table.empty.title')}
              </div>
              <div className="max-w-[360px] text-xs leading-relaxed text-mc-text-muted">
                {t('table.empty.body')}
              </div>
              <div className="mt-1 flex gap-1.5">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-7 items-center rounded-[7px] border border-border bg-mc-elev px-3 text-[11.5px] font-medium text-foreground hover:border-mc-border-strong"
                >
                  {t('table.empty.clear')}
                </button>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-7 items-center rounded-[7px] bg-mc-accent px-3 text-[11.5px] font-medium text-mc-accent-fg hover:bg-mc-accent-strong"
                >
                  {t('table.empty.reset')}
                </button>
              </div>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-mc-text-dim" />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            <RoutesTable
              rows={pageRows}
              density={dense}
              sort={sort}
              onSort={onSort}
              visible={visibleCols}
              selectedIds={selectedIds}
              onToggle={toggle}
              onToggleAll={toggleAll}
              allSelected={allSelected}
              drillId={drillId}
              onRowClick={(id) => setDrillId((cur) => (cur === id ? null : id))}
            />

            {/* Footer */}
            <div className="flex items-center gap-2 border-t border-border px-6 py-2.5 text-xs text-mc-text-muted">
              <span>
                <span className="font-mono font-semibold text-foreground">
                  {selectedIds.size.toLocaleString(i18n.language)}
                </span>{' '}
                · 1.10 MB
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[11px] text-mc-text-dim">{t('table.rowsPerPage')}</span>
                <span className="inline-flex h-[26px] items-center gap-1 rounded-md border border-border bg-mc-elev px-2 font-mono text-[11.5px]">
                  {PAGE_SIZE}
                  <ChevronDown className="h-3 w-3 text-mc-text-dim" />
                </span>
                <span className="ml-2">
                  {t('table.pageRangeOf', {
                    from: sorted.length === 0 ? 0 : safePage * PAGE_SIZE + 1,
                    to: Math.min((safePage + 1) * PAGE_SIZE, sorted.length),
                    total: sorted.length,
                  })}
                </span>
                <div className="ml-2 inline-flex overflow-hidden rounded-md border border-border bg-mc-elev font-mono text-[11.5px]">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="h-[26px] min-w-[26px] border-r border-border px-1.5 text-mc-text-muted hover:bg-mc-surface hover:text-foreground"
                  >
                    ‹
                  </button>
                  {Array.from({ length: Math.min(3, totalPages) }, (_, i) => i).map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPage(i)}
                      className={cn(
                        'h-[26px] min-w-[26px] border-r border-border px-1.5 hover:bg-mc-surface hover:text-foreground',
                        safePage === i ? 'bg-mc-surface text-foreground' : 'text-mc-text-muted',
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                  {totalPages > 4 && (
                    <span className="grid h-[26px] min-w-[26px] place-items-center border-r border-border text-mc-text-dim">
                      …
                    </span>
                  )}
                  {totalPages > 3 && (
                    <button
                      type="button"
                      onClick={() => setPage(totalPages - 1)}
                      className={cn(
                        'h-[26px] min-w-[26px] border-r border-border px-1.5 hover:bg-mc-surface hover:text-foreground',
                        safePage === totalPages - 1 ? 'bg-mc-surface text-foreground' : 'text-mc-text-muted',
                      )}
                    >
                      {totalPages}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    className="h-[26px] min-w-[26px] px-1.5 text-mc-text-muted hover:bg-mc-surface hover:text-foreground"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {drillId && drillRow && (
          <DrillPanel
            routeId={drillId}
            fallbackName={drillRow.driverName}
            fallbackStatus={drillRow.status}
            onClose={() => setDrillId(null)}
          />
        )}
      </div>
    </div>
  );
}
