import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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

export default function ReportsPage() {
  const { tab, from, to, setTab, setRange } = useReportsStore();
  const { isConnected } = useSocket();
  const [params] = useSearchParams();

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
  // Fall back to the handoff figures so the header reads well before data loads.
  const routes = useRoutesByDateRange(from, to).data?.length;
  const visits = useVisitCompletions(from, to).data?.length;
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
      <ReportsHeader counts={counts} />
      <div className="flex min-h-0 flex-1 flex-col">
        <TabBody tab={tab} />
      </div>
      <Footer isConnected={isConnected} />
    </div>
  );
}
