import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { env } from '@/config/env';
import { refreshTokens } from './auth-refresh';
import { WS_EVENTS } from '@/types/ws-events.types';
import type { EnrichedPosition } from '@/types/position.types';
import type { VisitEvent } from '@/types/visit.types';
import type {
  JoinTenantDto,
  JoinDriverDto,
  JoinRouteDto,
  ActiveDriversResponse,
  CdcChangeEvent,
  PipelineTrace,
} from '@/types/ws-events.types';
import type { CdcLagSnapshot } from '@/types/monitoring.types';

class SocketService {
  private socket: Socket | null = null;
  private isRefreshingToken = false;
  private networkListenersAdded = false;
  // First successful connect is silent; we only toast when the link comes back
  // after a real drop (avoids a "Connected" toast on initial load).
  private hasConnected = false;

  connect(token: string): Socket {
    // Reuse an existing socket — even one mid-reconnect. Recreating it orphaned
    // the previous instance (with its listeners and retry loop), leaking
    // duplicate connections. Just refresh the auth token and (re)connect.
    if (this.socket) {
      this.socket.auth = { token };
      if (!this.socket.connected) this.socket.connect();
      return this.socket;
    }

    this.socket = io(`${env.wsUrl}/tracking`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity, // keep retrying; a laptop sleep/outage must not kill live updates
    });

    this.setupNetworkReconnect();

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      // Only announce reconnections, not the initial connect.
      if (this.hasConnected) toast.success(i18n.t('common:connection.reconnected'));
      this.hasConnected = true;
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

      // We retry forever (reconnectionAttempts: Infinity), so this is transient.
      toast.error(i18n.t('common:connection.error'));
    });

    this.socket.on(WS_EVENTS.ERROR, (error: { message: string }) => {
      console.error('WebSocket error:', error);
      const msg = error.message?.toLowerCase() ?? '';
      if (msg.includes('auth') || msg.includes('expired')) {
        this.refreshTokenAndReconnect();
        return;
      }
      toast.error(error.message || i18n.t('common:connection.error'));
    });

    return this.socket;
  }

  /**
   * Reconnect promptly when the browser regains connectivity or the tab becomes
   * visible again, instead of waiting out the backoff timer. Registered once.
   */
  private setupNetworkReconnect(): void {
    if (this.networkListenersAdded || typeof window === 'undefined') return;
    this.networkListenersAdded = true;
    const tryReconnect = () => {
      if (this.socket && !this.socket.connected) this.socket.connect();
    };
    window.addEventListener('online', tryReconnect);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tryReconnect();
    });
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
      // Shared, de-duped with the axios interceptor so the two paths can't
      // double-rotate the refresh token.
      const accessToken = await refreshTokens();
      // Update socket auth so the next reconnect uses the fresh token.
      this.socket.auth = { token: accessToken };
      if (!this.socket.connected) this.socket.connect();
    } catch (err) {
      console.error('Failed to refresh token for WebSocket:', err);
      toast.error(i18n.t('common:connection.sessionExpired'));
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
      this.hasConnected = false;
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

  onCdcChange(callback: (data: CdcChangeEvent) => void): void {
    this.socket?.on(WS_EVENTS.CDC_CHANGE, callback);
  }

  offCdcChange(callback: (data: CdcChangeEvent) => void): void {
    this.socket?.off(WS_EVENTS.CDC_CHANGE, callback);
  }

  onPipelineTrace(callback: (data: PipelineTrace) => void): void {
    this.socket?.on(WS_EVENTS.PIPELINE_TRACE, callback);
  }

  offPipelineTrace(callback: (data: PipelineTrace) => void): void {
    this.socket?.off(WS_EVENTS.PIPELINE_TRACE, callback);
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
