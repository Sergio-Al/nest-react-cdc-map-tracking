import axios from 'axios';
import { env } from '@/config/env';

/**
 * Single source of truth for rotating the access + refresh tokens.
 *
 * Both the axios response interceptor and the WebSocket service call this. A
 * module-level in-flight promise de-dupes concurrent callers so they share one
 * /auth/refresh round-trip — otherwise two independent refreshes would each
 * consume the (rotating) refresh token and the second would fail, logging the
 * user out. Returns the new access token; throws (and clears auth storage) on
 * failure, leaving the redirect decision to the caller.
 */
let inFlight: Promise<string> | null = null;

export function refreshTokens(): Promise<string> {
  if (inFlight) return inFlight;
  inFlight = doRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRefresh(): Promise<string> {
  const authData = localStorage.getItem('auth-storage');
  if (!authData) throw new Error('No auth data');

  const { state } = JSON.parse(authData);
  const refreshToken = state?.refreshToken;
  if (!refreshToken) throw new Error('No refresh token');

  const response = await axios.post<{ accessToken: string; refreshToken: string }>(
    `${env.apiUrl}/api/auth/refresh`,
    { refreshToken },
  );
  const { accessToken, refreshToken: newRefreshToken } = response.data;

  localStorage.setItem(
    'auth-storage',
    JSON.stringify({ state: { ...state, accessToken, refreshToken: newRefreshToken } }),
  );

  // Sync the Zustand store so other consumers pick up the fresh token without a
  // reload (lazy import avoids a circular dependency).
  try {
    const { useAuthStore } = await import('@/stores/auth.store');
    useAuthStore.getState().setTokens(accessToken, newRefreshToken);
  } catch {
    /* store may not be initialised yet */
  }

  return accessToken;
}
