import { useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { exportToCsv } from '@/lib/utils';
import { ReportCard, ReportCardHead, ReportCardBody } from './ReportCard';
import { Leaderboard } from './Leaderboard';
import { useDriverLeaderboard } from '@/hooks/api/useReports';
import { useReportsStore } from '@/stores/reports.store';
import { useRegisterExporter } from '@/hooks/useReportExporter';

const GREEN = 'oklch(0.72 0.16 150)';
const RED = 'oklch(0.65 0.18 25)';

export function DriversTab() {
  const { from, to } = useReportsStore();
  const { byVisits, byOnTime, byDistance } = useDriverLeaderboard(from, to);

  const doExport = useCallback(() => {
    if (byVisits.length === 0) {
      toast.info('No driver activity to export');
      return;
    }
    exportToCsv(
      byVisits.map((d, i) => ({
        Rank: i + 1,
        Driver: d.name,
        Visits: d.visits,
        'On-time %': d.otp,
        'Distance (km)': d.km,
        Delta: d.delta,
      })),
      'drivers-leaderboard',
    );
    toast.success('Exported driver leaderboard');
  }, [byVisits]);
  useRegisterExporter(doExport);

  const perDay = byVisits.map((d) => d.visits / 14);
  const avg = perDay.length ? perDay.reduce((a, b) => a + b, 0) / perDay.length : 1;

  return (
    <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-6 pb-6 pt-[18px]">
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <ReportCard>
          <ReportCardHead
            title="By visits"
            sub="last 14 days"
            actions={
              <button className="inline-flex h-[26px] items-center gap-1 rounded-md border border-border bg-mc-elev px-2 text-[11.5px] font-medium text-foreground hover:border-mc-border-strong">
                Visits
                <ChevronDown className="h-3 w-3 text-mc-text-dim" />
              </button>
            }
          />
          <ReportCardBody>
            <Leaderboard rows={byVisits} metric="visits" />
          </ReportCardBody>
        </ReportCard>

        <ReportCard>
          <ReportCardHead title="By on-time %" sub="last 14 days" />
          <ReportCardBody>
            <Leaderboard rows={byOnTime} metric="otp" />
          </ReportCardBody>
        </ReportCard>
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <ReportCard>
          <ReportCardHead title="By distance" sub="km driven" />
          <ReportCardBody>
            <Leaderboard rows={byDistance} metric="km" />
          </ReportCardBody>
        </ReportCard>

        <ReportCard>
          <ReportCardHead title="Comparison · all drivers" sub="visits per day vs fleet avg" />
          <ReportCardBody className="flex flex-col gap-3">
            {byVisits.map((d) => {
              const v = d.visits / 14;
              const ratio = avg ? (v - avg) / avg : 0;
              const wL = ratio < 0 ? Math.min(Math.abs(ratio) * 100, 50) : 0;
              const wR = ratio > 0 ? Math.min(ratio * 100, 50) : 0;
              return (
                <div key={d.driverId} className="flex items-center gap-2.5">
                  <div className="w-[110px] truncate text-xs text-mc-text-muted">{d.name}</div>
                  <div className="relative flex h-4 flex-1 items-center overflow-hidden rounded-full bg-mc-surface">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-mc-border-strong" />
                    <div
                      className="absolute inset-y-0 right-1/2"
                      style={{ width: `${wL}%`, background: RED }}
                    />
                    <div
                      className="absolute inset-y-0 left-1/2"
                      style={{ width: `${wR}%`, background: GREEN }}
                    />
                  </div>
                  <div
                    className="w-[70px] text-right font-mono text-[11.5px] font-semibold"
                    style={{ color: ratio < 0 ? RED : 'oklch(0.55 0.16 150)' }}
                  >
                    {ratio >= 0 ? '+' : ''}
                    {(ratio * 100).toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </ReportCardBody>
        </ReportCard>
      </div>
    </div>
  );
}
