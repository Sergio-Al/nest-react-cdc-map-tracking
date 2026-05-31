import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, MapPin, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haversineKm } from '@/lib/geo';
import {
  getCustomerMeta,
  lastVisitLabel,
  CATEGORY_META,
  WINDOW_RANGES,
} from '@/lib/mock/customerMeta';
import type { CustomerCategory, VisitWindow } from '@/lib/mock/customerMeta';
import type { Customer } from '@/types/customer.types';

interface AddStopPaletteProps {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  existingCustomerIds: number[];
  /** Reference point for "+km" and nearness — last stop or depot. */
  origin: { lat: number; lon: number } | null;
  onAdd: (
    customerIds: number[],
    window: { start?: string; end?: string },
    keepOpen: boolean,
  ) => void;
  isLoading?: boolean;
}

type ChipKey = 'all' | 'recent' | 'frequent' | 'near' | CustomerCategory;

interface Candidate {
  customer: Customer;
  meta: ReturnType<typeof getCustomerMeta>;
  distanceKm: number | null;
}

const SUGGEST_LIMIT = 5;

const WINDOW_OPTIONS: { key: VisitWindow; label: string; hint?: string }[] = [
  { key: 'anytime', label: 'Anytime' },
  { key: 'morning', label: 'Morning', hint: '08-12' },
  { key: 'afternoon', label: 'Afternoon', hint: '12-17' },
  { key: 'evening', label: 'Evening', hint: '17-21' },
];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

function zone(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(',').map((s) => s.trim());
  return parts[parts.length - 1] || null;
}

function highlight(name: string, query: string) {
  if (!query) return name;
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return name;
  return (
    <>
      {name.slice(0, idx)}
      <span className="text-mc-accent">{name.slice(idx, idx + query.length)}</span>
      {name.slice(idx + query.length)}
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-mc-surface px-1.5 py-px font-mono text-[10.5px] tracking-[0.02em] text-mc-text-dim">
      {children}
    </kbd>
  );
}

export function AddStopPalette({
  open,
  onClose,
  customers,
  existingCustomerIds,
  origin,
  onAdd,
  isLoading,
}: AddStopPaletteProps) {
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<ChipKey>('near');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [win, setWin] = useState<VisitWindow>('morning');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('12:00');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setChip('near');
      setSelected(new Set());
      setCursor(0);
      setWin('morning');
      setStart('08:00');
      setEnd('12:00');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // All addable customers with derived metadata + distance.
  const candidates = useMemo<Candidate[]>(() => {
    const existing = new Set(existingCustomerIds);
    return customers
      .filter((c) => c.active && c.latitude != null && c.longitude != null && !existing.has(c.id))
      .map((c) => ({
        customer: c,
        meta: getCustomerMeta(c),
        distanceKm: origin
          ? haversineKm(origin, { lat: c.latitude!, lon: c.longitude! })
          : null,
      }));
  }, [customers, existingCustomerIds, origin]);

  const counts = useMemo(() => {
    const byCat: Record<string, number> = {};
    let recent = 0;
    let frequent = 0;
    for (const c of candidates) {
      byCat[c.meta.category] = (byCat[c.meta.category] ?? 0) + 1;
      if (c.meta.recent) recent++;
      if (c.meta.frequent) frequent++;
    }
    return { all: candidates.length, recent, frequent, near: Math.min(SUGGEST_LIMIT, candidates.length), byCat };
  }, [candidates]);

  const passesChip = useCallback(
    (c: Candidate): boolean => {
      switch (chip) {
        case 'all':
        case 'near':
          return true;
        case 'recent':
          return c.meta.recent;
        case 'frequent':
          return c.meta.frequent;
        default:
          return c.meta.category === chip;
      }
    },
    [chip],
  );

  // MATCHING: query hits, honouring the active chip.
  const matching = useMemo<Candidate[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return candidates
      .filter(passesChip)
      .filter(
        (c) =>
          c.customer.name.toLowerCase().includes(q) ||
          (c.customer.address?.toLowerCase().includes(q) ?? false),
      )
      .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  }, [candidates, query, passesChip]);

  // SUGGESTED NEAR ROUTE: nearest few, chip-aware, excluding the matches above.
  const suggested = useMemo<Candidate[]>(() => {
    const matchIds = new Set(matching.map((m) => m.customer.id));
    return candidates
      .filter(passesChip)
      .filter((c) => !matchIds.has(c.customer.id))
      .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
      .slice(0, SUGGEST_LIMIT);
  }, [candidates, matching, passesChip]);

  // Flat list backing keyboard navigation + ⌘number quick-toggle.
  const rows = useMemo(() => [...matching, ...suggested], [matching, suggested]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const windowRange = (): { start?: string; end?: string } =>
    win === 'anytime' ? {} : { start, end };

  const commit = (keepOpen: boolean) => {
    const ids =
      selected.size > 0
        ? rows.filter((r) => selected.has(r.customer.id)).map((r) => r.customer.id)
        : rows[cursor]
          ? [rows[cursor].customer.id]
          : [];
    if (ids.length === 0) return;
    onAdd(ids, windowRange(), keepOpen);
    if (keepOpen) {
      setSelected(new Set());
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const pickWindow = (w: VisitWindow) => {
    setWin(w);
    if (w !== 'anytime') {
      setStart(WINDOW_RANGES[w].start);
      setEnd(WINDOW_RANGES[w].end);
    }
  };

  // Keyboard handling for the whole palette.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, rows.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(e.shiftKey);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelected((prev) =>
        prev.size === rows.length
          ? new Set()
          : new Set(rows.map((r) => r.customer.id)),
      );
      return;
    }
    if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      if (rows[idx]) {
        e.preventDefault();
        toggle(rows[idx].customer.id);
        setCursor(idx);
      }
    }
  };

  if (!open) return null;

  const renderRow = (c: Candidate, flatIndex: number) => {
    const { customer, meta, distanceKm } = c;
    const Cat = CATEGORY_META[meta.category];
    const isCursor = flatIndex === cursor;
    const isChecked = selected.has(customer.id);
    const z = zone(customer.address);
    return (
      <button
        key={customer.id}
        type="button"
        onClick={() => {
          toggle(customer.id);
          setCursor(flatIndex);
        }}
        onMouseEnter={() => setCursor(flatIndex)}
        className={cn(
          'flex w-full items-center gap-3 border-l-2 px-4 py-2.5 text-left transition-colors',
          isCursor
            ? 'border-mc-accent bg-mc-accent-soft'
            : 'border-transparent hover:bg-mc-surface',
        )}
      >
        <span
          className={cn(
            'grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[4px] border transition-colors',
            isChecked ? 'border-mc-accent bg-mc-accent text-mc-accent-fg' : 'border-mc-border-strong',
          )}
        >
          {isChecked && (
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M2.5 6.5 5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>

        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px]"
          style={{ background: `color-mix(in oklch, ${Cat.tint} 16%, transparent)`, color: Cat.tint }}
        >
          <Cat.icon className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-foreground">
              {highlight(customer.name, query.trim())}
            </span>
            {meta.urgency === 'urgent' && (
              <span className="shrink-0 rounded-[4px] bg-status-offline/15 px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-[0.05em] text-status-offline">
                Urgent
              </span>
            )}
            {meta.urgency === 'priority' && (
              <span className="shrink-0 rounded-[4px] bg-mc-accent-soft px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-[0.05em] text-mc-accent">
                Priority
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-mc-text-dim">
            {customer.address ?? '—'}
            {z && <span className="text-mc-text-muted"> · {z}</span>}
            <span> · last visit {lastVisitLabel(meta.lastVisitDays)}</span>
            <span> · {meta.monthlyFrequency}× /mo</span>
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          {distanceKm != null && (
            <span className="font-mono text-[11.5px] font-medium text-foreground">
              +{distanceKm.toFixed(1)} km
            </span>
          )}
          {flatIndex < 9 ? (
            <Kbd>⌘{flatIndex + 1}</Kbd>
          ) : (
            <span className="text-[10.5px] capitalize text-mc-text-dim">{meta.preferredWindow}</span>
          )}
        </span>
      </button>
    );
  };

  const CHIPS: { key: ChipKey; label: string; count: number; pin?: boolean }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'recent', label: 'Recent', count: counts.recent },
    { key: 'frequent', label: 'Frequent', count: counts.frequent },
    { key: 'near', label: 'Near route', count: counts.near, pin: true },
    ...(Object.keys(CATEGORY_META) as CustomerCategory[]).map((cat) => ({
      key: cat,
      label: CATEGORY_META[cat].label,
      count: counts.byCat[cat] ?? 0,
    })),
  ];

  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-start justify-center" onKeyDown={onKeyDown}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />

      {/* Panel */}
      <div className="relative mt-[12vh] flex max-h-[76vh] w-[min(760px,92vw)] flex-col overflow-hidden rounded-mc-lg border border-mc-border-strong bg-mc-elev shadow-mc-palette">
        {/* Search */}
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="h-[15px] w-[15px] shrink-0 text-mc-text-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers by name or address…"
            className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-mc-text-dim focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="grid h-5 w-5 place-items-center rounded text-mc-text-dim hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <Kbd>esc</Kbd>
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2.5">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChip(c.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                chip === c.key
                  ? 'border-mc-accent-border bg-mc-accent-soft text-mc-accent'
                  : 'border-border text-muted-foreground hover:bg-mc-surface hover:text-foreground',
              )}
            >
              {c.pin && <MapPin className="h-3 w-3" />}
              <span>{c.label}</span>
              <span className={cn('font-mono', chip === c.key ? 'text-mc-accent' : 'text-mc-text-dim')}>
                {c.count}
              </span>
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12.5px] text-mc-text-dim">
              No customers match.
            </div>
          ) : (
            <>
              {matching.length > 0 && (
                <>
                  <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
                    Matching <span className="font-mono">{matching.length}</span>
                  </div>
                  {matching.map((c, i) => renderRow(c, i))}
                </>
              )}
              {suggested.length > 0 && (
                <>
                  <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
                    Suggested near this route <span className="font-mono">{suggested.length}</span>
                  </div>
                  {suggested.map((c, i) => renderRow(c, matching.length + i))}
                </>
              )}
            </>
          )}
        </div>

        {/* Window selector */}
        <div className="flex items-center gap-2.5 border-t border-border px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-mc-text-dim">
            <Clock className="h-3 w-3" /> Window
          </span>
          <div className="flex items-center gap-1">
            {WINDOW_OPTIONS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => pickWindow(w.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-[6px] border px-2 py-1 text-[11.5px] font-medium transition-colors',
                  win === w.key
                    ? 'border-mc-accent-border bg-mc-accent-soft text-mc-accent'
                    : 'border-border text-muted-foreground hover:bg-mc-surface hover:text-foreground',
                )}
              >
                {w.label}
                {w.hint && <span className="font-mono text-[9.5px] text-mc-text-dim">{w.hint}</span>}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <TimeSelect value={start} onChange={(v) => { setStart(v); setWin('anytime'); }} disabled={win === 'anytime'} />
            <span className="text-mc-text-dim">–</span>
            <TimeSelect value={end} onChange={(v) => { setEnd(v); setWin('anytime'); }} disabled={win === 'anytime'} />
          </div>
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-3.5 border-t border-border bg-mc-surface px-4 py-2 text-[10.5px] text-mc-text-dim">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> add{selected.size > 0 ? ` ${selected.size}` : ''}
          </span>
          <span className="flex items-center gap-1"><Kbd>⇧</Kbd><Kbd>↵</Kbd> add &amp; new</span>
          <span className="flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>A</Kbd> select all</span>
          {isLoading && <Loader2 className="h-3 w-3 animate-spin text-mc-accent" />}
          <span className="ml-auto font-mono">{candidates.length.toLocaleString()} customers</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TimeSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        'h-7 rounded-[6px] border border-border bg-mc-elev px-2 font-mono text-[11.5px] text-foreground transition-colors hover:border-mc-border-strong focus:outline-none disabled:opacity-40',
      )}
    >
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
