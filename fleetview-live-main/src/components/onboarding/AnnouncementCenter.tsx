import { useTranslation } from "react-i18next";
import { Sparkles, X } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { useEntitlements } from "@/hooks/api/useEntitlements";
import { useOnboardingState, useAckOnboarding } from "@/hooks/api/useOnboarding";
import { ANNOUNCEMENTS, type Announcement } from "./announcements";

const DONE = new Set(["completed", "dismissed"]);

/**
 * Surfaces the next un-acknowledged feature announcement from the registry as a
 * dismissible card (bottom-right). Announcements are gated by role/plan and
 * acknowledged once per user, persisted server-side via the onboarding ack-log.
 * Renders nothing while loading, when nothing is pending, or when not signed in.
 */
export function AnnouncementCenter() {
  const { t } = useTranslation("announcements");
  const role = useAuthStore((s) => s.user?.role);
  const { data: state, isLoading } = useOnboardingState();
  const { data: entitlements } = useEntitlements();
  const ackMutation = useAckOnboarding();

  if (isLoading || !state || !role) return null;

  const matches = (a: Announcement): boolean => {
    if (DONE.has(state[a.key]?.status ?? "pending")) return false;
    if (a.roles && !a.roles.includes(role)) return false;
    if (a.plans && (!entitlements || !a.plans.includes(entitlements.planCode)))
      return false;
    return true;
  };

  const next = ANNOUNCEMENTS.find(matches);
  if (!next) return null;

  const dismiss = () =>
    ackMutation.mutate({ key: next.key, payload: { status: "dismissed" } });

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-card text-card-foreground shadow-lg">
      <div className="flex items-start gap-3 p-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t(next.titleKey)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t(next.bodyKey)}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("dismiss")}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
