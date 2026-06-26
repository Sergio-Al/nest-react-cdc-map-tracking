/**
 * Shared CORS origin policy for both the HTTP server (main.ts) and the Socket.io
 * gateway (tracking.gateway.ts). Kept env-based (not config-service based) so the
 * gateway can use it at decorator-evaluation time, where DI isn't available yet.
 *
 * Policy:
 *  - Always allow the explicit `CORS_ORIGINS` whitelist (comma-separated).
 *  - In non-production, ALSO allow any localhost / 127.0.0.1 origin on any port,
 *    so the frontend dev server port (3001, 5173, …) never gets CORS-blocked.
 *  - In production, only the explicit whitelist is allowed.
 *  - Requests with no Origin header (curl, same-origin, server-to-server) pass.
 */

export const STATIC_CORS_ORIGINS = (
  process.env.CORS_ORIGINS || 'http://localhost:3001,http://localhost:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const IS_PROD = (process.env.NODE_ENV || 'development') === 'production';
const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true; // non-browser / same-origin / curl
  if (STATIC_CORS_ORIGINS.includes(origin)) return true;
  if (!IS_PROD && LOCALHOST_ORIGIN_RE.test(origin)) return true;
  return false;
}

/** `origin` callback usable by both Express CORS and Socket.io CORS config. */
export const corsOrigin = (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
): void => cb(null, isAllowedOrigin(origin));
