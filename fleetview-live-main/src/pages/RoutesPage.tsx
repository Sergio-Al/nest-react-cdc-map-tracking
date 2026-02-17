import { RouteBuilderSidebar } from '@/components/routes/RouteBuilderSidebar';
import { RouteBuilderMap } from '@/components/routes/RouteBuilderMap';
import { useRouteBuilderStore } from '@/stores/routeBuilder.store';
import { useCustomers, useRouteGeometry } from '@/hooks/api/useRouteBuilder';

export default function RoutesPage() {
  const { localVisits, selectedRouteId } = useRouteBuilderStore();
  const { data: customers = [] } = useCustomers();
  const { data: geometry } = useRouteGeometry(selectedRouteId, localVisits.length);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <RouteBuilderSidebar />
      <RouteBuilderMap
        visits={localVisits}
        customers={customers}
        geometry={geometry ?? null}
      />
    </div>
  );
}
