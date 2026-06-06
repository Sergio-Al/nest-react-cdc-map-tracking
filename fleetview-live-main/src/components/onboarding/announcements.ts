import type { UserRole } from "@/types/auth.types";

/**
 * Config-as-code "what's new" registry.
 *
 * Each entry is a feature announcement shown once per user, then acknowledged
 * (persisted server-side via the onboarding ack-log under `key`). Shipping a
 * new announcement = append one entry here + its copy in the `announcements`
 * i18n namespace (en + es). No backend or schema change required.
 *
 * `key` MUST be stable and unique forever — it's the acknowledgement key.
 * `titleKey`/`bodyKey` are i18n keys resolved in the `announcements` namespace.
 * Optional `roles`/`plans` gate visibility; omit to show to everyone.
 */
export interface Announcement {
  key: string;
  titleKey: string;
  bodyKey: string;
  roles?: UserRole[];
  plans?: string[]; // plan codes (see Entitlements.planCode)
}

export const ANNOUNCEMENTS: Announcement[] = [
  // Example (commented out — uncomment + add i18n copy to ship a "what's new"):
  // {
  //   key: "feature_route_playback_v1",
  //   titleKey: "routePlayback.title",
  //   bodyKey: "routePlayback.body",
  //   roles: ["admin", "dispatcher"],
  // },
];
