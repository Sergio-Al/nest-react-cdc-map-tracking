import { cn } from "@/lib/utils";

const CITY = "La Paz, Bolivia";
const STATUS_GREEN = "var(--mc-status-moving)";
const STATUS_RED = "var(--mc-status-offline)";

const HINTS: { keys: string[]; label: string }[] = [
  { keys: ["↑", "↓"], label: "navigate" },
  { keys: ["↵"], label: "open driver" },
  { keys: ["F"], label: "focus on map" },
  { keys: ["N"], label: "new route" },
  { keys: ["⌘", "K"], label: "commands" },
  { keys: ["⌘", "/"], label: "all shortcuts" },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-mc-elev px-1.5 py-px font-mono text-[10.5px] tracking-[0.02em] text-muted-foreground">
      {children}
    </kbd>
  );
}

export function Footer({ isConnected }: { isConnected: boolean }) {
  return (
    <footer className="flex h-[30px] shrink-0 items-center gap-3.5 border-t border-border bg-background px-3.5">
      <div className="hidden items-center gap-3.5 md:flex">
        {HINTS.map((h, i) => (
          <div key={h.label} className="flex items-center gap-3.5">
            {i > 0 && <span className="h-3 w-px bg-border" />}
            <span className="flex items-center gap-1 text-[10.5px] text-mc-text-dim">
              {h.keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
              <span className="ml-0.5">{h.label}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2 font-mono text-[10.5px]">
        <span
          className={cn("h-1.5 w-1.5 rounded-full", isConnected && "animate-livepulse")}
          style={{ background: isConnected ? STATUS_GREEN : STATUS_RED }}
        />
        <span className={isConnected ? "text-muted-foreground" : "text-status-offline"}>
          {isConnected ? `Connected · ${CITY}` : "Reconnecting…"}
        </span>
      </div>
    </footer>
  );
}
