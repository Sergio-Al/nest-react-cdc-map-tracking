import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { EnrichedPosition } from '../enrichment/enrichment.types';
import {
  VisitEvent,
  JoinTenantDto,
  JoinDriverDto,
  JoinRouteDto,
  ActiveDriversResponse,
  GatewayStats,
  WS_EVENTS,
} from './ws.types';
import { CdcLagSnapshot } from '../sync/cdc-metrics.service';

/**
 * WebSocket gateway for real-time tracking updates.
 * Implements room-based broadcasting per tenant, driver, and route.
 */
@WebSocketGateway({
  namespace: '/tracking',
  cors: { origin: '*' },
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TrackingGateway.name);
  private connectedClients = 0;

  constructor(
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  // ── Lifecycle ───────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      // Extract JWT token from handshake
      const token = client.handshake.auth?.token
        || client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.emit('error', { message: 'Authentication required' });
        client.disconnect(true);
        return;
      }

      // Verify JWT token
      const payload = this.jwtService.verify(token);
      const user = await this.authService.validateUser(payload);

      if (!user) {
        this.logger.warn(`Client ${client.id} authentication failed`);
        client.emit('error', { message: 'Authentication failed' });
        client.disconnect(true);
        return;
      }

      // Store user data in socket
      client.data.user = {
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        driverId: user.driverId,
      };

      // Auto-join tenant room
      const tenantRoom = `tenant:${user.tenantId}`;
      client.join(tenantRoom);

      // Auto-join admin role room for operational monitoring
      if (user.role === 'admin') {
        client.join('role:admin');
        this.logger.debug(`Client ${client.id} joined role:admin room`);
      }

      this.connectedClients++;
      this.logger.log(
        `Client connected: ${client.id} (user: ${user.email}, tenant: ${user.tenantId}, total: ${this.connectedClients})`,
      );
    } catch (error) {
      this.logger.error(`Client ${client.id} authentication error:`, error);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedClients--;
    this.logger.log(
      `Client disconnected: ${client.id} (total: ${this.connectedClients})`,
    );
  }

  // ── Room Management ─────────────────────────────────────────

  @SubscribeMessage(WS_EVENTS.JOIN_TENANT)
  handleJoinTenant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinTenantDto,
  ): void {
    const user = client.data.user;
    if (!user || user.tenantId !== data.tenantId) {
      this.logger.warn(`Client ${client.id} attempted to join unauthorized tenant ${data.tenantId}`);
      client.emit('error', { message: 'Unauthorized tenant access' });
      return;
    }
    const room = `tenant:${data.tenantId}`;
    client.join(room);
    this.logger.debug(`Client ${client.id} joined ${room}`);
  }

  @SubscribeMessage(WS_EVENTS.JOIN_DRIVER)
  handleJoinDriver(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinDriverDto,
  ): void {
    const user = client.data.user;
    if (user?.role === 'driver' && user.driverId !== data.driverId) {
      this.logger.warn(`Driver ${client.id} attempted to join unauthorized driver ${data.driverId}`);
      client.emit('error', { message: 'Unauthorized driver access' });
      return;
    }
    const room = `driver:${data.driverId}`;
    client.join(room);
    this.logger.debug(`Client ${client.id} joined ${room}`);
  }

  @SubscribeMessage(WS_EVENTS.JOIN_ROUTE)
  handleJoinRoute(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinRouteDto,
  ): void {
    const room = `route:${data.routeId}`;
    client.join(room);
    this.logger.debug(`Client ${client.id} joined ${room}`);
  }

  @SubscribeMessage(WS_EVENTS.LEAVE_TENANT)
  handleLeaveTenant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinTenantDto,
  ): void {
    const room = `tenant:${data.tenantId}`;
    client.leave(room);
    this.logger.debug(`Client ${client.id} left ${room}`);
  }

  @SubscribeMessage(WS_EVENTS.LEAVE_DRIVER)
  handleLeaveDriver(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinDriverDto,
  ): void {
    const room = `driver:${data.driverId}`;
    client.leave(room);
    this.logger.debug(`Client ${client.id} left ${room}`);
  }

  @SubscribeMessage(WS_EVENTS.LEAVE_ROUTE)
  handleLeaveRoute(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinRouteDto,
  ): void {
    const room = `route:${data.routeId}`;
    client.leave(room);
    this.logger.debug(`Client ${client.id} left ${room}`);
  }

  // ── Active Drivers Query ────────────────────────────────────

  @SubscribeMessage(WS_EVENTS.GET_ACTIVE_DRIVERS)
  async handleGetActiveDrivers(
    @ConnectedSocket() client: Socket,
  ): Promise<ActiveDriversResponse> {
    try {
      // Scan for all driver position keys in Redis
      const keys = await this.redisService.getClient().keys('pos:driver:*');
      const drivers = keys.map((key) => key.replace('pos:driver:', ''));

      this.logger.debug(`Client ${client.id} requested active drivers (${drivers.length} found)`);

      return {
        drivers,
        count: drivers.length,
      };
    } catch (error) {
      this.logger.error('Failed to retrieve active drivers', error);
      return { drivers: [], count: 0 };
    }
  }

  // ── Broadcasting ────────────────────────────────────────────

  /**
   * Broadcast an enriched GPS position to all matching rooms.
   * Emits to: tenant:{tenantId}, driver:{driverId}, and route:{routeId} (if present).
   */
  broadcastPosition(position: EnrichedPosition): void {
    const rooms: string[] = [
      `tenant:${position.tenantId}`,
      `driver:${position.driverId}`,
    ];

    if (position.routeId) {
      rooms.push(`route:${position.routeId}`);
    }

    rooms.forEach((room) => {
      this.server.to(room).emit(WS_EVENTS.POSITION_UPDATE, position);
    });

    console.log(`Broadcasting position for driver ${position.driverId} to rooms: ${rooms.join(', ')}`);
    this.logger.debug(
      `Broadcast position for driver ${position.driverId} to ${rooms.length} rooms`,
    );
  }

  /**
   * Broadcast a visit lifecycle event to all matching rooms.
   * Emits to: tenant:{tenantId}, driver:{driverId}, and route:{routeId}.
   */
  broadcastVisitEvent(event: VisitEvent): void {
    const rooms: string[] = [
      `tenant:${event.tenantId}`,
      `driver:${event.driverId}`,
      `route:${event.routeId}`,
    ];

    rooms.forEach((room) => {
      this.server.to(room).emit(WS_EVENTS.VISIT_UPDATE, event);
    });

    this.logger.debug(
      `Broadcast visit event ${event.visitId} (${event.currentStatus}) to ${rooms.length} rooms`,
    );
  }

  /**
   * Broadcast CDC lag metrics to admin users.
   * Only emitted to the role:admin room.
   */
  broadcastCdcLag(snapshot: CdcLagSnapshot): void {
    this.server.to('role:admin').emit(WS_EVENTS.CDC_LAG, snapshot);
    this.logger.debug(`Broadcast CDC lag snapshot to admin room`);
  }

  // ── Health & Stats ──────────────────────────────────────────

  /**
   * Get current gateway statistics for health checks.
   */
  getStats(): GatewayStats {
    const rooms = this.server.sockets.adapter.rooms.size;
    return {
      connectedClients: this.connectedClients,
      rooms,
    };
  }
}
