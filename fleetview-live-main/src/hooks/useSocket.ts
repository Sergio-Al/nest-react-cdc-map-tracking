import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { socketService } from '@/lib/socket';

/**
 * Subscribes the calling page to the shared WebSocket connection's status.
 *
 * The socket is a SESSION-LIFETIME singleton: it connects once while
 * authenticated and stays connected across page navigation. Pages must NOT
 * disconnect it on unmount — doing so reconnected on every route change, which
 * spammed the "Connected" toast and triggered a token refresh each time.
 * Teardown happens on logout (see auth.store). Token refresh updates the
 * socket's auth in place (see socket.ts), so the access token is intentionally
 * NOT a dependency here.
 */
export function useSocket() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const [isConnected, setIsConnected] = useState(() => socketService.isConnected());

  useEffect(() => {
    if (!isAuthenticated || !tenantId) {
      setIsConnected(false);
      return;
    }

    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    // connect() reuses the existing live socket if already connected.
    const socket = socketService.connect(token);
    socketService.joinTenant(tenantId);

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    setIsConnected(socket.connected);

    return () => {
      // Only detach this page's status listeners — keep the socket alive.
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [isAuthenticated, tenantId]);

  return { isConnected };
}
