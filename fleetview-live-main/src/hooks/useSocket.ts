import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { socketService } from '@/lib/socket';

export function useSocket() {
  const { isAuthenticated, accessToken, user } = useAuthStore();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !accessToken || !user) {
      socketService.disconnect();
      setIsConnected(false);
      return;
    }

    // Connect with current access token
    const socket = socketService.connect(accessToken);

    // Auto-join tenant room
    if (user.tenantId) {
      socketService.joinTenant(user.tenantId);
    }

    // Update connection status
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      if (user.tenantId) {
        socketService.leaveTenant(user.tenantId);
      }
      socketService.disconnect();
    };
  }, [isAuthenticated, accessToken, user]);

  return { isConnected };
}
