import { Card } from '@/components/ui/card';
import type { CdcLagSnapshot } from '@/types/monitoring.types';

interface Props {
  snapshot: CdcLagSnapshot;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

function formatLag(lagMs: number): { text: string; color: string } {
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

export function CdcSummaryBar({ snapshot }: Props) {
  const maxLag = formatLag(snapshot.totals.maxLagMs);
  const avgLag = formatLag(snapshot.totals.avgLagMs);

  return (
    <Card className="border-t">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <div>
            <div className="text-sm text-muted-foreground">Total Events</div>
            <div className="text-2xl font-bold">
              {snapshot.totals.totalEventsProcessed.toLocaleString()}
            </div>
          </div>
          
          <div className="h-10 w-px bg-border" />
          
          <div>
            <div className="text-sm text-muted-foreground">Errors</div>
            <div className={`text-2xl font-bold ${snapshot.totals.totalErrors > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {snapshot.totals.totalErrors.toLocaleString()}
            </div>
          </div>
          
          <div className="h-10 w-px bg-border" />
          
          <div>
            <div className="text-sm text-muted-foreground">Max Lag</div>
            <div className={`text-2xl font-bold ${maxLag.color}`}>
              {maxLag.text}
            </div>
          </div>
          
          <div className="h-10 w-px bg-border" />
          
          <div>
            <div className="text-sm text-muted-foreground">Avg Lag</div>
            <div className={`text-2xl font-bold ${avgLag.color}`}>
              {avgLag.text}
            </div>
          </div>
        </div>
        
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Uptime</div>
          <div className="text-lg font-semibold">
            {formatDuration(snapshot.uptimeSeconds)}
          </div>
        </div>
      </div>
    </Card>
  );
}
