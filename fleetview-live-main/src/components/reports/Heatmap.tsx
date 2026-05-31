import { heatmapValue } from '@/lib/mock/reportsMock';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function colorFor(v: number): string {
  const norm = Math.min(v / 8, 1);
  if (norm < 0.05) return 'var(--mc-surface)';
  return `oklch(0.72 ${(0.04 + 0.13 * norm).toFixed(3)} 50 / ${(0.18 + 0.7 * norm).toFixed(3)})`;
}

/** Visits-by-hour-of-day × day-of-week heatmap. */
export function Heatmap() {
  return (
    <div
      className="grid flex-1 gap-0.5 font-mono text-[9.5px] text-mc-text-dim"
      style={{ gridTemplateColumns: '32px repeat(24, 1fr)' }}
    >
      <div />
      {HOURS.map((h) => (
        <div key={`c${h}`} className="flex h-4 items-center justify-center">
          {h % 6 === 0 ? String(h).padStart(2, '0') : ''}
        </div>
      ))}
      {DAYS.map((d, di) => (
        <div key={di} className="contents">
          <div className="flex h-4 items-center justify-end pr-1">{d}</div>
          {HOURS.map((h) => {
            const v = heatmapValue(di, h);
            return (
              <div
                key={h}
                className="aspect-square cursor-pointer rounded-[3px] transition-transform hover:scale-110 hover:outline hover:outline-1 hover:outline-mc-accent"
                style={{ background: colorFor(v) }}
                title={`${d} ${String(h).padStart(2, '0')}:00 · ${v.toFixed(1)} visits/hour`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
