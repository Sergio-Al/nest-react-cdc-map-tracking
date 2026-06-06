// Workspace slug rules, shared by the signup DTO validation, the availability
// check, and the tenants service. A slug is the tenantId users type at login,
// so it must be URL/route-safe and memorable.

// 3–30 chars, lowercase a-z 0-9 and hyphens, no leading/trailing hyphen.
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

// Names that would collide with routes/system concepts — not claimable.
export const RESERVED_SLUGS = new Set<string>([
  'admin', 'api', 'app', 'www', 'login', 'signup', 'auth', 'settings',
  'dashboard', 'tenant', 'tenants', 'billing', 'static', 'assets', 'public',
  'me', 'health', 'webhook', 'subscriptions',
]);

export function isValidSlug(id: string): boolean {
  return SLUG_REGEX.test(id);
}

export function isReservedSlug(id: string): boolean {
  return RESERVED_SLUGS.has(id);
}
