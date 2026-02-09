import { cn } from "@/lib/utils";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function MapLegend() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="absolute bottom-4 left-4 z-10 bento-card glass">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold"
      >
        Legend
        {collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-2 animate-fade-in">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Driver Status
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="status-dot-active" /> Moving
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="status-dot-idle" /> Idle
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="status-dot-offline" /> Offline
              </div>
            </div>
          </div>

          <div className="h-px bg-border" />

          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Visit Status
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-visit-pending" /> Pending
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-visit-arrived" /> Arrived
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-visit-completed" /> Completed
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-visit-skipped" /> Skipped
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
