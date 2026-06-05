import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileBarChart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Footer } from '@/components/dashboard/Footer';
import { ReportsHeader } from '@/components/reports/ReportsHeader';
import { OverviewTab } from '@/components/reports/OverviewTab';
import { RoutesTab } from '@/components/reports/RoutesTab';
import { DriversTab } from '@/components/reports/DriversTab';
import { VisitsTab, VehiclesTab, CustomersTab } from '@/components/reports/DataTables';
import { ComingSoon } from '@/components/reports/ComingSoon';
import { useReportsStore, type ReportTab } from '@/stores/reports.store';
import { useSocket } from '@/hooks/useSocket';
import { useRoutesByDateRange, useVisitCompletions } from '@/hooks/api/useHistory';
import { useDrivers } from '@/hooks/api/useDrivers';
import { useVehicles } from '@/hooks/api/useVehicles';
import { useCustomers } from '@/hooks/api/useRouteBuilder';
import { useEntitlements } from '@/hooks/api/useEntitlements';

function TabBody({ tab }: { tab: ReportTab }) {
  switch (tab) {
    case 'overview':
      return <OverviewTab />;
    case 'routes':
      return <RoutesTab />;
    case 'visits':
      return <VisitsTab />;
    case 'drivers':
      return <DriversTab />;
    case 'vehicles':
      return <VehiclesTab />;
    case 'customers':
      return <CustomersTab />;
    case 'fuel':
      return <ComingSoon kind="fuel" />;
    case 'safety':
      return <ComingSoon kind="safety" />;
  }
}

const VALID_TABS = [
  'overview',
  'routes',
  'visits',
  'drivers',
  'vehicles',
  'customers',
  'fuel',
  'safety',
] as const;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function ReportsLocked() {
  const { t } = useTranslation('reports');
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="flex max-w-[480px] flex-col items-center gap-3 rounded-xl border border-dashed border-mc-border-strong bg-mc-elev p-8 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-[14px] border border-border bg-mc-surface text-mc-text-dim">
          <FileBarChart className="h-[22px] w-[22px]" />
        </div>
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
          {t('locked.title')}
        </div>
        <div className="max-w-[360px] text-xs leading-relaxed text-mc-text-muted">
          {t('locked.body')}
        </div>
        <span className="mt-1 rounded-full border border-border bg-mc-surface px-2.5 py-0.5 font-mono text-[10.5px] text-mc-text-dim">
          {t('locked.badge')}
        </span>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { tab, from, to, setTab, setRange } = useReportsStore();
  const { isConnected } = useSocket();
  const [params] = useSearchParams();

  const { data: entitlements } = useEntitlements();
  // Default to true while loading so we don't flash-hide on first render.
  const hasReports = entitlements === undefined ? true : entitlements.features.includes('reports');

  // Hydrate from a shared deep-link (?tab=&from=&to=) once on mount.
  useEffect(() => {
    const t = params.get('tab');
    const f = params.get('from');
    const u = params.get('to');
    if (t && (VALID_TABS as readonly string[]).includes(t)) setTab(t as ReportTab);
    if (f && u && YMD.test(f) && YMD.test(u)) setRange(f, u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab counts — these queries are shared (deduped) with the tab bodies.
  // Pass null dates when the feature gate is not met to prevent 403s on /history/*.
  const gatedFrom = hasReports ? from : null;
  const gatedTo = hasReports ? to : null;
  const routes = useRoutesByDateRange(gatedFrom, gatedTo).data?.length;
  const visits = useVisitCompletions(gatedFrom, gatedTo).data?.length;
  const drivers = useDrivers().data?.length;
  const vehicles = useVehicles().data?.length;
  const customers = useCustomers().data?.length;

  const counts: Partial<Record<ReportTab, number>> = {
    routes: routes ?? 312,
    visits: visits ?? 1284,
    drivers: drivers ?? 9,
    vehicles: vehicles ?? 8,
    customers: customers ?? 248,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {hasReports && <ReportsHeader counts={counts} />}
      <div className="flex min-h-0 flex-1 flex-col">
        {hasReports ? <TabBody tab={tab} /> : <ReportsLocked />}
      </div>
      <Footer isConnected={isConnected} />
    </div>
  );
}
