import { useCdcLag } from '@/hooks/useCdcLag';
import { useTranslation } from 'react-i18next';
import { LagCard } from '@/components/monitoring/LagCard';
import { OffsetLagTable } from '@/components/monitoring/OffsetLagTable';
import { CdcSummaryBar } from '@/components/monitoring/CdcSummaryBar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Activity } from 'lucide-react';

export default function MonitoringPage() {
  const { data: snapshot, isLoading, error } = useCdcLag();
  const { t, i18n } = useTranslation('monitoring');

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('page.errorTitle')}</AlertTitle>
          <AlertDescription>
            {t('page.errorBody', {
              message: error instanceof Error ? error.message : t('page.unknownError'),
            })}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('page.noDataTitle')}</AlertTitle>
          <AlertDescription>{t('page.noDataBody')}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">{t('page.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('page.subtitle')}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">{t('page.lastUpdated')}</div>
          <div className="text-sm font-medium">
            {new Date(snapshot.timestamp).toLocaleTimeString(i18n.language)}
          </div>
        </div>
      </div>

      {/* Table Lag Cards */}
      <div>
        <h2 className="text-xl font-semibold mb-4">{t('page.tableSync')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {snapshot.tables.map((table) => (
            <LagCard key={table.table} metrics={table} />
          ))}
        </div>
      </div>

      {/* Kafka Offset Lag */}
      <OffsetLagTable offsetLags={snapshot.kafkaOffsetLag} />

      {/* Summary Bar */}
      <CdcSummaryBar snapshot={snapshot} />
    </div>
  );
}
