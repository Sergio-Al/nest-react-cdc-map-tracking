import { create } from "zustand";

/**
 * Client/UI state for the Mission Control dashboard shell.
 * (Inbox filter/sort + detail-tab state are added in later phases.)
 */
interface DashboardState {
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  toggleCommand: () => void;
  /** Inbox slide-over (used below the `lg` breakpoint). */
  inboxSheetOpen: boolean;
  setInboxSheetOpen: (open: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),
  toggleCommand: () => set((s) => ({ commandOpen: !s.commandOpen })),
  inboxSheetOpen: false,
  setInboxSheetOpen: (open) => set({ inboxSheetOpen: open }),
}));
