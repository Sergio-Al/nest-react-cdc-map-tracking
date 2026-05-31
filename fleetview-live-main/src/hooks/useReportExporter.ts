import { useEffect } from 'react';
import { useReportsStore } from '@/stores/reports.store';

/**
 * Registers the active report tab's CSV exporter with the store so the shared
 * header Export button runs whatever the current tab is showing (filters and
 * all). Cleared on unmount so a tab without data leaves the button inert.
 * Pass a `useCallback`-stable `fn`.
 */
export function useRegisterExporter(fn: () => void) {
  const setExporter = useReportsStore((s) => s.setExporter);
  useEffect(() => {
    setExporter(fn);
    return () => setExporter(null);
  }, [fn, setExporter]);
}
