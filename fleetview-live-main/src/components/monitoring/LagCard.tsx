import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LagSparkline } from './LagSparkline';
import type { TableMetrics } from '@/types/monitoring.types';

interface Props {
  metrics: TableMetrics;
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return 'Never';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function formatLag(lagMs: number | null): { text: string; color: string } {
  if (lagMs === null) return { text: 'N/A', color: 'text-muted-foreground' };
  
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

function getOpBadge(op: string | null): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (!op) return { label: 'N/A', variant: 'outline' };
  switch (op) {
    case 'c':
      return { label: 'CREATE', variant: 'default' };
    case 'u':
      return { label: 'UPDATE', variant: 'secondary' };
    case 'd':
      return { label: 'DELETE', variant: 'destructive' };
    case 'r':
      return { label: 'READ', variant: 'outline' };
    default:
      return { label: op.toUpperCase(), variant: 'outline' };
  }
}

export function LagCard({ metrics }: Props) {
  const lag = formatLag(metrics.lastEndToEndLagMs);
  const opBadge = getOpBadge(metrics.lastOp);

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
              {metrics.errorsCount} errors
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current Lag */}
        <div>
          <div className={`text-2xl font-bold ${lag.color}`}>{lag.text}</div>
          <div className="text-xs text-muted-foreground">End-to-end lag</div>
        </div>

        {/* Events Counter */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Events processed:</span>
          <span className="font-medium">{metrics.eventsProcessed.toLocaleString()}</span>
        </div>

        {/* Last Operation */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Last operation:</span>
          <Badge variant={opBadge.variant} className="text-xs">
            {opBadge.label}
          </Badge>
        </div>

        {/* Last Event Time */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Last event:</span>
          <span className="font-medium">{formatTimestamp(metrics.lastProcessedAt)}</span>
        </div>

        {/* Sparkline */}
        <div className="pt-2">
          <LagSparkline data={metrics.lagHistory} width={240} height={50} thresholdMs={1000} />
        </div>

        {/* Last Error */}
        {metrics.lastError && (
          <div className="pt-2 border-t">
            <div className="text-xs text-red-600 font-medium">Last Error:</div>
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
