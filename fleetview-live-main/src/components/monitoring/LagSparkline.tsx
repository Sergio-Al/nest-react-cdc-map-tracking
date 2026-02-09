interface Props {
  data: Array<{ ts: number; lagMs: number }>;
  width?: number;
  height?: number;
  thresholdMs?: number;
}

export function LagSparkline({
  data,
  width = 120,
  height = 40,
  thresholdMs = 1000,
}: Props) {
  if (!data || data.length === 0) {
    return (
      <svg width={width} height={height} className="text-muted-foreground">
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="10" fill="currentColor">
          No data
        </text>
      </svg>
    );
  }

  const maxLag = Math.max(...data.map((d) => d.lagMs), thresholdMs);
  const minLag = Math.min(...data.map((d) => d.lagMs), 0);
  const range = maxLag - minLag || 1;
  
  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Generate polyline points
  const points = data
    .map((point, index) => {
      const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
      const y = padding + chartHeight - ((point.lagMs - minLag) / range) * chartHeight;
      return `${x},${y}`;
    })
    .join(' ');

  // Determine color based on lag
  const avgLag = data.reduce((sum, d) => sum + d.lagMs, 0) / data.length;
  const strokeColor = avgLag > thresholdMs ? 'rgb(239, 68, 68)' : 'rgb(34, 197, 94)';
  const fillColor = avgLag > thresholdMs ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)';

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Fill area under the line */}
      <polygon
        points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
        fill={fillColor}
      />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Threshold line (optional) */}
      {thresholdMs > 0 && (
        <line
          x1={padding}
          y1={padding + chartHeight - ((thresholdMs - minLag) / range) * chartHeight}
          x2={width - padding}
          y2={padding + chartHeight - ((thresholdMs - minLag) / range) * chartHeight}
          stroke="rgb(234, 179, 8)"
          strokeWidth="0.5"
          strokeDasharray="2,2"
          opacity="0.5"
        />
      )}
    </svg>
  );
}
