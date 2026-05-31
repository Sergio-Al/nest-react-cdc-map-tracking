import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMapStore } from "@/stores/map.store";
import { useDashboardStore } from "@/stores/dashboard.store";
import { isTypingTarget } from "@/lib/dom";

/**
 * Page-level dashboard shortcuts:
 *   F → focus the map on the selected driver
 *   N → new route
 * (⌘K and ⌘/ live in the command palette; / and ↑↓ live in the inbox.)
 */
export function useDashboardHotkeys() {
  const navigate = useNavigate();
  const focusSelected = useMapStore((s) => s.focusSelected);
  const selectedDriverId = useMapStore((s) => s.selectedDriverId);
  const setInboxSheetOpen = useDashboardStore((s) => s.setInboxSheetOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "f" && selectedDriverId) {
        e.preventDefault();
        focusSelected();
      } else if (k === "n") {
        e.preventDefault();
        navigate("/routes");
      } else if (e.key === "Escape") {
        setInboxSheetOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, focusSelected, selectedDriverId, setInboxSheetOpen]);
}
