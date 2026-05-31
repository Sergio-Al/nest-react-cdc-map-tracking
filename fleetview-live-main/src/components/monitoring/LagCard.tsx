import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LagSparkline } from './LagSparkline';
import type { TableMetrics } from '@/types/monitoring.types';

interface Props {
  metrics: TableMetrics;
}

function formatLag(lagMs: number | null): { text: string; color: string; key?: 'na' } {
  if (lagMs === null) return { text: '', color: 'text-muted-foreground', key: 'na' };

  if (lagMs < 1000) {
    return { text: `${lagMs}ms`, color: 'text-green-600' };
  } else if (lagMs < 5000) {
    return { text: `${(lagMs / 1000).toFixed(1)}s`, color: 'text-yellow-600' };
  } else if (lagMs < 30000) {
    return { text: `${(lagMs / 1000).toFixed(1)}s`, color: 'text-orange-600' };
  } else {
    return { text: `${(lagMs / 1000).toFixed(1)}s`, color: 'text-red-600' };
  }
}

function opBadgeVariant(op: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!op) return 'outline';
  switch (op) {
    case 'c': return 'default';
    case 'u': return 'secondary';
    case 'd': return 'destructive';
    case 'r': return 'outline';
    default: return 'outline';
  }
}

export function LagCard({ metrics }: Props) {
  const { t, i18n } = useTranslation('monitoring');

  const formatTimestamp = (ts: number | null): string => {
    if (!ts) return t('lagCard.never');
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return t('lagCard.secondsAgo', { count: seconds });
    if (seconds < 3600) return t('lagCard.minutesAgo', { count: Math.floor(seconds / 60) });
    return t('lagCard.hoursAgo', { count: Math.floor(seconds / 3600) });
  };

  const opLabel = (op: string | null): string => {
    if (!op) return t('lagCard.na');
    const key = `lagCard.ops.${op}`;
    return t(key, { defaultValue: op.toUpperCase() });
  };

  const lag = formatLag(metrics.lastEndToEndLagMs);
  const lagText = lag.key === 'na' ? t('lagCard.na') : lag.text;
  const opVariant = opBadgeVariant(metrics.lastOp);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm font-medium">{metrics.table}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{metrics.topic}</p>
          </div>
          {metrics.errorsCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {t('lagCard.errors', { count: metrics.errorsCount })}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current Lag */}
        <div>
          <div className={`text-2xl font-bold ${lag.color}`}>{lagText}</div>
          <div className="text-xs text-muted-foreground">{t('lagCard.endToEndLag')}</div>
        </div>

        {/* Events Counter */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('lagCard.eventsProcessed')}</span>
          <span className="font-medium">{metrics.eventsProcessed.toLocaleString(i18n.language)}</span>
        </div>

        {/* Last Operation */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('lagCard.lastOperation')}</span>
          <Badge variant={opVariant} className="text-xs">
            {opLabel(metrics.lastOp)}
          </Badge>
        </div>

        {/* Last Event Time */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('lagCard.lastEvent')}</span>
          <span className="font-medium">{formatTimestamp(metrics.lastProcessedAt)}</span>
        </div>

        {/* Sparkline */}
        <div className="pt-2">
          <LagSparkline data={metrics.lagHistory} width={240} height={50} thresholdMs={1000} />
        </div>

        {/* Last Error */}
        {metrics.lastError && (
          <div className="pt-2 border-t">
            <div className="text-xs text-red-600 font-medium">{t('lagCard.lastError')}</div>
            <div className="text-xs text-muted-foreground truncate mt-1" title={metrics.lastError}>
              {metrics.lastError}
            </div>
            <div className="text-xs text-muted-foreground">{formatTimestamp(metrics.lastErrorAt)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
