import { useEffect, useRef } from 'react';
import { useReportsStore } from '@/stores/reports.store';

/**
 * Registers the active report tab's CSV exporter with the store so the shared
 * header Export button runs whatever the current tab is showing (filters and
 * all). Cleared on unmount so a tab without data leaves the button inert.
 *
 * The store gets one stable wrapper per mount that calls the latest `fn`.
 * Registering `fn` itself made every new identity a store update, and since
 * tabs read the whole store, a `fn` rebuilt on each render (e.g. from a
 * `data = []` default while a new range loads) looped forever.
 */
export function useRegisterExporter(fn: () => void) {
  const setExporter = useReportsStore((s) => s.setExporter);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    setExporter(() => latest.current());
    return () => setExporter(null);
  }, [setExporter]);
}
