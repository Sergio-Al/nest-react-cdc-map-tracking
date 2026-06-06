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
  /**
   * Bumped to force-open the welcome tour on demand (Settings / command
   * palette), independent of the server "already seen" state. WelcomeOnboarding
   * watches this counter and reopens when it increments.
   */
  welcomeReplay: number;
  replayWelcome: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),
  toggleCommand: () => set((s) => ({ commandOpen: !s.commandOpen })),
  inboxSheetOpen: false,
  setInboxSheetOpen: (open) => set({ inboxSheetOpen: open }),
  welcomeReplay: 0,
  replayWelcome: () => set((s) => ({ welcomeReplay: s.welcomeReplay + 1 })),
}));
