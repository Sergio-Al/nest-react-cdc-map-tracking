/** Minimal area/line sparkline (ported from the design handoff). */
export function Sparkline({
  data,
  color = 'var(--mc-accent)',
  height = 26,
  area = true,
}: {
  data: number[];
  color?: string;
  height?: number;
  area?: boolean;
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const W = 100;
  const H = 30;
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return [x, y] as const;
  });
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const areaPath = `${path} L ${W},${H} L 0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      {area && <path d={areaPath} fill={color} opacity="0.15" />}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
