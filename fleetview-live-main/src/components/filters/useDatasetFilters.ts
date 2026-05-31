import { useCallback, useMemo, useState } from 'react';
import { applyFilters } from './engine';
import type { ActiveFilter, FieldDef, SavedView } from './types';

const STORAGE_PREFIX = 'reports:views:';

function loadSaved(key: string): SavedView[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) ?? '[]');
  } catch {
    return [];
  }
}

function persistSaved(key: string, views: SavedView[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(views));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export interface ViewWithCount extends SavedView {
  count: number;
}

/**
 * Owns filter + saved-view state for one dataset. Built-in views come from the
 * caller; user-saved views persist to localStorage (per `datasetKey`). The
 * active view "deactivates" the moment filters are edited by hand.
 */
export function useDatasetFilters<T>(
  datasetKey: string,
  rows: T[],
  fields: FieldDef<T>[],
  builtins: SavedView[],
) {
  const [filters, setFilters] = useState<ActiveFilter[]>(builtins[0]?.filters ?? []);
  const [activeViewId, setActiveViewId] = useState<string>(builtins[0]?.id ?? 'all');
  const [saved, setSaved] = useState<SavedView[]>(() => loadSaved(datasetKey));

  const allViews = useMemo(() => [...builtins, ...saved], [builtins, saved]);

  const filtered = useMemo(() => applyFilters(rows, filters, fields), [rows, filters, fields]);

  const views = useMemo<ViewWithCount[]>(
    () => allViews.map((v) => ({ ...v, count: applyFilters(rows, v.filters, fields).length })),
    [allViews, rows, fields],
  );

  const updateFilters = useCallback(
    (next: ActiveFilter[]) => {
      setFilters(next);
      setActiveViewId(next.length === 0 ? builtins[0]?.id ?? 'all' : '');
    },
    [builtins],
  );

  const selectView = useCallback(
    (id: string) => {
      const v = allViews.find((x) => x.id === id);
      setActiveViewId(id);
      setFilters(v ? v.filters : []);
    },
    [allViews],
  );

  const saveView = useCallback(
    (name: string) => {
      const view: SavedView = { id: crypto.randomUUID(), name, filters, star: true };
      setSaved((prev) => {
        const next = [...prev, view];
        persistSaved(datasetKey, next);
        return next;
      });
      setActiveViewId(view.id);
    },
    [datasetKey, filters],
  );

  const deleteView = useCallback(
    (id: string) => {
      setSaved((prev) => {
        const next = prev.filter((v) => v.id !== id);
        persistSaved(datasetKey, next);
        return next;
      });
      setActiveViewId((cur) => (cur === id ? '' : cur));
    },
    [datasetKey],
  );

  return { filters, updateFilters, filtered, views, activeViewId, selectView, saveView, deleteView };
}
