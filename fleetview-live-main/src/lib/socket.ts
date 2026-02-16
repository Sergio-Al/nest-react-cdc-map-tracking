import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { toast } from 'sonner';
import { env } from '@/config/env';
import { WS_EVENTS } from '@/types/ws-events.types';
import type { EnrichedPosition } from '@/types/position.types';
import type { VisitEvent } from '@/types/visit.types';
import type {
  JoinTenantDto,
  JoinDriverDto,
  JoinRouteDto,
  ActiveDriversResponse,
} from '@/types/ws-events.types';
import type { CdcLagSnapshot } from '@/types/monitoring.types';

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isRefreshingToken = false;

  connect(token: string): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(`${env.wsUrl}/tracking`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
      toast.success('Connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server forcefully disconnected (likely auth error) — try token refresh
        this.refreshTokenAndReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;

      // Attempt token refresh on auth-related failures
      const msg = error.message?.toLowerCase() ?? '';
      if (
        msg.includes('jwt') ||
        msg.includes('expired') ||
        msg.includes('auth') ||
        msg.includes('unauthorized')
      ) {
        this.refreshTokenAndReconnect();
        return;
      }
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        toast.error('Connection lost. Please refresh the page.');
      } else {
        toast.error('Connection error, reconnecting...');
      }
    });

    this.socket.on(WS_EVENTS.ERROR, (error: { message: string }) => {
      console.error('WebSocket error:', error);
      const msg = error.message?.toLowerCase() ?? '';
      if (msg.includes('auth') || msg.includes('expired')) {
        this.refreshTokenAndReconnect();
        return;
      }
      toast.error(error.message || 'WebSocket error');
    });

    return this.socket;
  }

  /**
   * Refresh the access token via the refresh endpoint and update
   * the socket auth so the next reconnection attempt uses a valid token.
   * Also syncs the Zustand auth store and localStorage.
   */
  private async refreshTokenAndReconnect(): Promise<void> {
    if (this.isRefreshingToken || !this.socket) return;
    this.isRefreshingToken = true;

    try {
      const authData = localStorage.getItem('auth-storage');
      if (!authData) throw new Error('No auth data');

      const { state } = JSON.parse(authData);
      const refreshToken = state?.refreshToken;
      if (!refreshToken) throw new Error('No refresh token');

      console.log('🔄 Refreshing token for WebSocket reconnection...');
      const response = await axios.post<{
        accessToken: string;
        refreshToken: string;
      }>(`${env.apiUrl}/api/auth/refresh`, { refreshToken });

      const { accessToken, refreshToken: newRefreshToken } = response.data;

      // Update localStorage
      const updatedState = { ...state, accessToken, refreshToken: newRefreshToken };
      localStorage.setItem('auth-storage', JSON.stringify({ state: updatedState }));

      // Sync Zustand store (lazy import to avoid circular deps)
      const { useAuthStore } = await import('@/stores/auth.store');
      useAuthStore.getState().setTokens(accessToken, newRefreshToken);

      // Update socket auth so next reconnect uses the fresh token
      this.socket.auth = { token: accessToken };
      this.reconnectAttempts = 0;

      // If socket.io auto-reconnect hasn't kicked in yet, trigger manually
      if (!this.socket.connected) {
        this.socket.connect();
      }

      console.log('✅ Token refreshed for WebSocket');
    } catch (err) {
      console.error('Failed to refresh token for WebSocket:', err);
      toast.error('Session expired. Please log in again.');
      localStorage.removeItem('auth-storage');
      window.location.href = '/login';
    } finally {
      this.isRefreshingToken = false;
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log('🔌 WebSocket disconnected');
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Room management
  joinTenant(tenantId: string): void {
    if (!this.socket) return;
    const payload: JoinTenantDto = { tenantId };
    this.socket.emit(WS_EVENTS.JOIN_TENANT, payload);
    console.log('📍 Joined tenant room:', tenantId);
  }

  joinDriver(driverId: string): void {
    if (!this.socket) return;
    const payload: JoinDriverDto = { driverId };
    this.socket.emit(WS_EVENTS.JOIN_DRIVER, payload);
    console.log('📍 Joined driver room:', driverId);
  }

  joinRoute(routeId: string): void {
    if (!this.socket) return;
    const payload: JoinRouteDto = { routeId };
    this.socket.emit(WS_EVENTS.JOIN_ROUTE, payload);
    console.log('📍 Joined route room:', routeId);
  }

  leaveTenant(tenantId: string): void {
    if (!this.socket) return;
    const payload: JoinTenantDto = { tenantId };
    this.socket.emit(WS_EVENTS.LEAVE_TENANT, payload);
    console.log('📍 Left tenant room:', tenantId);
  }

  leaveDriver(driverId: string): void {
    if (!this.socket) return;
    const payload: JoinDriverDto = { driverId };
    this.socket.emit(WS_EVENTS.LEAVE_DRIVER, payload);
    console.log('📍 Left driver room:', driverId);
  }

  leaveRoute(routeId: string): void {
    if (!this.socket) return;
    const payload: JoinRouteDto = { routeId };
    this.socket.emit(WS_EVENTS.LEAVE_ROUTE, payload);
    console.log('📍 Left route room:', routeId);
  }

  // Event listeners
  onPositionUpdate(callback: (data: EnrichedPosition) => void): void {
    if (!this.socket) return;
    this.socket.on(WS_EVENTS.POSITION_UPDATE, callback);
  }

  onVisitUpdate(callback: (data: VisitEvent) => void): void {
    if (!this.socket) return;
    this.socket.on(WS_EVENTS.VISIT_UPDATE, callback);
  }

  offPositionUpdate(callback: (data: EnrichedPosition) => void): void {
    if (!this.socket) return;
    this.socket.off(WS_EVENTS.POSITION_UPDATE, callback);
  }

  offVisitUpdate(callback: (data: VisitEvent) => void): void {
    if (!this.socket) return;
    this.socket.off(WS_EVENTS.VISIT_UPDATE, callback);
  }

  onCdcLag(callback: (data: CdcLagSnapshot) => void): void {
    if (!this.socket) return;
    this.socket.on(WS_EVENTS.CDC_LAG, callback);
  }

  offCdcLag(callback: (data: CdcLagSnapshot) => void): void {
    if (!this.socket) return;
    this.socket.off(WS_EVENTS.CDC_LAG, callback);
  }

  // Request active drivers
  getActiveDrivers(callback: (data: ActiveDriversResponse) => void): void {
    if (!this.socket) return;
    this.socket.emit(WS_EVENTS.GET_ACTIVE_DRIVERS);
    this.socket.once('active-drivers', callback);
  }
}

// Export singleton instance
export const socketService = new SocketService();
