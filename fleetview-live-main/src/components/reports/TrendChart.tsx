import { useTranslation } from 'react-i18next';
import { REPORT_TREND } from '@/lib/mock/reportsMock';
import type { TrendData } from '@/hooks/api/useReports';

const GREEN = 'oklch(0.72 0.16 150)';

/** Round up to a "nice" axis maximum (multiple of 5/10/…) at or above v. */
function niceMax(v: number): number {
  if (v <= 0) return 10;
  const step = v <= 10 ? 2 : v <= 50 ? 10 : v <= 100 ? 20 : 50;
  return Math.ceil(v / step) * step;
}

/** Dual-axis trend: visits (area + current line + dashed prev period) and on-time %. */
export function TrendChart({
  data = REPORT_TREND,
  showPrev = true,
}: {
  data?: TrendData;
  showPrev?: boolean;
}) {
  const { days, visits, visitsPrev, otp, marker } = data;
  const { t } = useTranslation('reports');
  const W = 760;
  const H = 200;
  const PAD_L = 32;
  const PAD_R = 36;
  const PAD_T = 16;
  const PAD_B = 26;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // Dynamic left (visits) axis; right (on-time %) axis widens below 80 if needed.
  const maxV = niceMax(Math.max(1, ...visits, ...(showPrev ? visitsPrev : [])));
  const minOtp = Math.min(80, ...otp.filter((p) => p > 0), 80);
  const otpFloor = Math.max(0, Math.floor(minOtp / 5) * 5);
  const otpSpan = 100 - otpFloor || 20;
  const vTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxV * f));
  const pTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(otpFloor + otpSpan * f));

  const denom = Math.max(days.length - 1, 1);
  const x = (i: number) => PAD_L + (i / denom) * innerW;
  const yV = (v: number) => PAD_T + innerH - (v / maxV) * innerH;
  const yP = (p: number) => PAD_T + innerH - ((p - otpFloor) / otpSpan) * innerH;

  const linePts = (arr: number[], fn: (v: number) => number) =>
    arr.map((v, i) => `${x(i)},${fn(v)}`).join(' ');
  const areaPath = (arr: number[], fn: (v: number) => number) =>
    `M ${x(0)},${PAD_T + innerH} L ${linePts(arr, fn).split(' ').join(' L ')} L ${x(
      arr.length - 1,
    )},${PAD_T + innerH} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220 }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
        <line
          key={i}
          x1={PAD_L}
          x2={W - PAD_R}
          y1={PAD_T + innerH * f}
          y2={PAD_T + innerH * f}
          stroke="var(--mc-border)"
          strokeOpacity="0.7"
          strokeDasharray={i === 0 || i === 4 ? '' : '2 4'}
        />
      ))}
      {vTicks.map((v, i) => (
        <text
          key={i}
          x={PAD_L - 6}
          y={yV(v) + 3}
          fontSize="9"
          className="font-mono"
          fill="var(--mc-text-dim)"
          textAnchor="end"
        >
          {v}
        </text>
      ))}
      {pTicks.map((p, i) => (
        <text
          key={i}
          x={W - PAD_R + 6}
          y={yP(p) + 3}
          fontSize="9"
          className="font-mono"
          fill="var(--mc-text-dim)"
          textAnchor="start"
        >
          {p}%
        </text>
      ))}
      {days.map((d, i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 8}
          fontSize="9.5"
          className="font-mono"
          fill="var(--mc-text-dim)"
          textAnchor="middle"
        >
          {d}
        </text>
      ))}

      {/* previous period (dashed) */}
      {showPrev && (
        <polyline
          points={linePts(visitsPrev, yV)}
          fill="none"
          stroke="var(--mc-text-dim)"
          strokeOpacity="0.6"
          strokeWidth="1.4"
          strokeDasharray="3 4"
        />
      )}
      {/* visits area + line */}
      <path d={areaPath(visits, yV)} fill="var(--mc-accent)" opacity="0.16" />
      <polyline
        points={linePts(visits, yV)}
        fill="none"
        stroke="var(--mc-accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {visits.map((v, i) => (
        <circle key={i} cx={x(i)} cy={yV(v)} r="2.5" fill="var(--mc-accent)" />
      ))}

      {/* on-time line (right axis) — skip days with no completed visits (otp 0) */}
      <polyline
        points={otp
          .map((v, i) => (v > 0 ? `${x(i)},${yP(v)}` : null))
          .filter(Boolean)
          .join(' ')}
        fill="none"
        stroke={GREEN}
        strokeWidth="2"
      />
      {otp.map((v, i) =>
        v > 0 ? <circle key={i} cx={x(i)} cy={yP(v)} r="2.2" fill={GREEN} /> : null,
      )}

      {/* tooltip marker */}
      <g transform={`translate(${x(marker.index)},${yV(marker.visits)})`}>
        <line
          y1={PAD_T - yV(marker.visits)}
          y2={PAD_T + innerH - yV(marker.visits)}
          stroke="var(--mc-accent)"
          strokeOpacity="0.4"
          strokeDasharray="2 3"
        />
        <rect
          x="6"
          y="-34"
          width="100"
          height="44"
          rx="6"
          fill="var(--mc-bg-elev)"
          stroke="var(--mc-border-strong)"
        />
        <text x="14" y="-21" fontSize="8.5" fill="var(--mc-text-dim)" className="font-mono">
          {marker.label}
        </text>
        <text
          x="14"
          y="-9"
          fontSize="11"
          fill="var(--mc-text)"
          className="font-mono"
          fontWeight="600"
        >
          {t('overview.trend.marker.visits', { count: marker.visits })}
        </text>
        <text x="14" y="3" fontSize="9.5" fill={GREEN} className="font-mono">
          {t('overview.trend.marker.ontime', { pct: marker.otp })}
        </text>
      </g>
    </svg>
  );
}
