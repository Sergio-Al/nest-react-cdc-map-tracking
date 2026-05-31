/** Linear-style segmented progress bar (shared by inbox + detail panel). */
export function ProgressBar({ total, progress }: { total: number; progress: number }) {
  return (
    <div
      className="grid h-[5px] gap-0.5"
      style={{ gridTemplateColumns: `repeat(${Math.max(total, 1)}, 1fr)` }}
    >
      {Array.from({ length: Math.max(total, 1) }).map((_, i) => (
        <div
          key={i}
          className="rounded-[1.5px]"
          style={{
            background:
              i < progress
                ? "var(--mc-accent)"
                : i === progress
                  ? "color-mix(in oklch, var(--mc-accent) 45%, transparent)"
                  : "var(--mc-surface-hi)",
          }}
        />
      ))}
    </div>
  );
}
