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
import { corsOrigin } from '../../common/cors';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { Driver } from '../drivers/entities/driver.entity';
import { Route } from '../routes/entities/route.entity';
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

// A driver counts as "active" if its last enriched position is within this
// window (matches the enrichment Redis position TTL of 5 minutes).
const ACTIVE_DRIVERS_WINDOW_MS = 5 * 60 * 1000;

/**
 * WebSocket gateway for real-time tracking updates.
 * Implements room-based broadcasting per tenant, driver, and route.
 */
@WebSocketGateway({
  namespace: '/tracking',
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
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
    @InjectRepository(Driver, 'cacheDb')
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Route, 'cacheDb')
    private readonly routeRepo: Repository<Route>,
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
  async handleJoinDriver(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinDriverDto,
  ): Promise<void> {
    const user = client.data.user;
    if (user?.role === 'driver' && user.driverId !== data.driverId) {
      this.logger.warn(`Driver ${client.id} attempted to join unauthorized driver ${data.driverId}`);
      client.emit('error', { message: 'Unauthorized driver access' });
      return;
    }
    // Verify the driver belongs to the caller's tenant before joining the room
    // (prevents cross-tenant live-position streaming).
    const driver = await this.driverRepo.findOne({
      where: { id: data.driverId, tenantId: user?.tenantId },
    });
    if (!driver) {
      this.logger.warn(`Client ${client.id} attempted to join unauthorized driver ${data.driverId}`);
      client.emit('error', { message: 'Unauthorized driver access' });
      return;
    }
    const room = `driver:${data.driverId}`;
    client.join(room);
    this.logger.debug(`Client ${client.id} joined ${room}`);
  }

  @SubscribeMessage(WS_EVENTS.JOIN_ROUTE)
  async handleJoinRoute(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinRouteDto,
  ): Promise<void> {
    const user = client.data.user;
    // Verify the route belongs to the caller's tenant before joining the room.
    const route = await this.routeRepo.findOne({
      where: { id: data.routeId, tenantId: user?.tenantId },
    });
    if (!route) {
      this.logger.warn(`Client ${client.id} attempted to join unauthorized route ${data.routeId}`);
      client.emit('error', { message: 'Unauthorized route access' });
      return;
    }
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

  /**
   * True if any client on this instance is in the admin room. Lets the CDC-lag
   * cron skip its work (and the admin Kafka client it creates) when nobody is
   * watching. The cron runs on every instance, so a remote admin is still
   * served by that instance's own cron.
   */
  hasAdminClients(): boolean {
    // `server` is the '/tracking' namespace at runtime (typed as Server); its
    // adapter holds the room→sockets map.
    const rooms = (this.server as any)?.adapter?.rooms;
    return (rooms?.get('role:admin')?.size ?? 0) > 0;
  }

  // ── Active Drivers Query ────────────────────────────────────

  @SubscribeMessage(WS_EVENTS.GET_ACTIVE_DRIVERS)
  async handleGetActiveDrivers(
    @ConnectedSocket() client: Socket,
  ): Promise<ActiveDriversResponse> {
    try {
      const tenantId = client.data.user?.tenantId;
      if (!tenantId) return { drivers: [], count: 0 };

      // Read the per-tenant active-driver sorted set (score = last-seen ms),
      // scoped to the caller's tenant and recent activity — no blocking KEYS
      // scan and no cross-tenant leak. Opportunistically trim stale members.
      const key = `active:drivers:${tenantId}`;
      const cutoff = Date.now() - ACTIVE_DRIVERS_WINDOW_MS;
      const drivers = await this.redisService.zrangebyscore(key, cutoff, '+inf');
      await this.redisService.zremrangebyscore(key, '-inf', cutoff);

      this.logger.debug(`Client ${client.id} requested active drivers (${drivers.length} in ${tenantId})`);

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
    // Guard the adapter chain: `this.server`/its namespace adapter can be
    // unset (e.g. before any socket has connected), and an unguarded deref
    // here would 500 the whole /api/health endpoint.
    const rooms = this.server?.sockets?.adapter?.rooms?.size ?? 0;
    return {
      connectedClients: this.connectedClients,
      rooms,
    };
  }
}
