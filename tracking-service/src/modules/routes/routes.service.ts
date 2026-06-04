import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere, Not, QueryFailedError } from 'typeorm';
import { Route } from './entities/route.entity';
import { PlannedVisit } from '../visits/entities/planned-visit.entity';
import { CreateRouteDto, UpdateRouteDto } from './dto/route.dto';

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  constructor(
    @InjectRepository(Route, 'cacheDb')
    private readonly routeRepo: Repository<Route>,
    @InjectRepository(PlannedVisit, 'cacheDb')
    private readonly visitRepo: Repository<PlannedVisit>,
  ) {}

  /**
   * Rejects if `driverId` already owns a non-cancelled route on `scheduledDate`.
   * `exceptRouteId` skips the route being edited so it doesn't conflict with itself.
   */
  private async assertDriverAvailable(
    tenantId: string,
    driverId: string,
    scheduledDate: string,
    exceptRouteId?: string,
  ): Promise<void> {
    const where: FindOptionsWhere<Route> = {
      tenantId,
      driverId,
      scheduledDate,
      status: Not('cancelled'),
    };
    if (exceptRouteId) where.id = Not(exceptRouteId);
    const existing = await this.routeRepo.findOne({ where });
    if (existing) this.throwDriverConflict(driverId, scheduledDate);
  }

  private throwDriverConflict(driverId: string, date: string): never {
    throw new ConflictException({
      errorCode: 'routes.driverConflict',
      args: { driverId, date },
    });
  }

  /**
   * Persist a route, translating the `uq_routes_active_driver_date` unique
   * violation (Postgres 23505) into the friendly driver-conflict error. This
   * is the backstop for the check-then-insert race that `assertDriverAvailable`
   * alone can't close.
   */
  private async saveRoute(route: Route): Promise<Route> {
    try {
      return await this.routeRepo.save(route);
    } catch (err) {
      const code =
        err instanceof QueryFailedError
          ? ((err as unknown as { code?: string }).code ??
            (err as unknown as { driverError?: { code?: string } }).driverError?.code)
          : undefined;
      if (code === '23505') this.throwDriverConflict(route.driverId, route.scheduledDate);
      throw err;
    }
  }

  /**
   * A pinned depot needs BOTH coordinates. Treats null/undefined as "not set",
   * so clearing the pin (both null) and leaving it unchanged (both undefined)
   * are valid; only a half-set pair is rejected.
   */
  private assertDepotPair(
    lat: number | null | undefined,
    lon: number | null | undefined,
  ): void {
    if (typeof lat === 'number' !== (typeof lon === 'number')) {
      throw new BadRequestException({ errorCode: 'routes.depotIncomplete' });
    }
  }

  async create(dto: CreateRouteDto): Promise<Route> {
    await this.assertDriverAvailable(dto.tenantId, dto.driverId, dto.scheduledDate);
    this.assertDepotPair(dto.depotLat, dto.depotLon);
    const route = this.routeRepo.create({
      tenantId: dto.tenantId,
      driverId: dto.driverId,
      scheduledDate: dto.scheduledDate,
      status: 'planned',
      totalStops: 0,
      completedStops: 0,
      depotLat: dto.depotLat ?? null,
      depotLon: dto.depotLon ?? null,
      depotLabel: dto.depotLabel ?? null,
      returnToDepot: dto.returnToDepot ?? true,
    });
    const saved = await this.saveRoute(route);
    this.logger.log(`Route created: ${saved.id} for driver ${dto.driverId}`);
    return saved;
  }

  async findAll(tenantId?: string): Promise<Route[]> {
    const where = tenantId ? { tenantId } : {};
    return this.routeRepo.find({
      where,
      order: { scheduledDate: 'DESC' },
      relations: ['visits'],
    });
  }

  async findByDateRange(
    tenantId: string,
    from: string,
    to: string,
    status?: string,
  ): Promise<Route[]> {
    const where: FindOptionsWhere<Route> = {
      tenantId,
      scheduledDate: Between(from, to),
    };
    if (status) where.status = status;
    return this.routeRepo.find({
      where,
      order: { scheduledDate: 'DESC' },
      relations: ['visits'],
    });
  }

  async findById(id: string): Promise<Route> {
    const route = await this.routeRepo.findOne({
      where: { id },
      relations: ['visits'],
    });
    if (!route) throw new NotFoundException({ errorCode: 'routes.notFound', args: { id } });
    return route;
  }

  async findActiveByDriver(driverId: string): Promise<Route | null> {
    return this.routeRepo.findOne({
      where: { driverId, status: 'in_progress' },
      relations: ['visits'],
      order: { scheduledDate: 'DESC' },
    });
  }

  async findTodayByDriver(driverId: string): Promise<Route | null> {
    const today = new Date().toISOString().split('T')[0];
    return this.routeRepo.findOne({
      where: { driverId, scheduledDate: today },
      relations: ['visits'],
    });
  }

  async update(id: string, dto: UpdateRouteDto): Promise<Route> {
    const route = await this.findById(id);
    if (dto.status) route.status = dto.status;

    // Depot edits (pin / drag / clear) and the open-route toggle. Only mutate
    // fields the caller actually sent; `null` clears, `undefined` leaves as-is.
    this.assertDepotPair(dto.depotLat, dto.depotLon);
    if (dto.depotLat !== undefined) route.depotLat = dto.depotLat;
    if (dto.depotLon !== undefined) route.depotLon = dto.depotLon;
    if (dto.depotLabel !== undefined) route.depotLabel = dto.depotLabel;
    if (dto.returnToDepot !== undefined) route.returnToDepot = dto.returnToDepot;

    const reassigning = !!dto.driverId && dto.driverId !== route.driverId;
    if (reassigning) {
      await this.assertDriverAvailable(route.tenantId, dto.driverId!, route.scheduledDate, route.id);
      route.driverId = dto.driverId!;
    }
    // Save first so the unique constraint fires before we touch the visits —
    // otherwise a lost race would leave visits pointing at the new driver.
    const saved = await this.saveRoute(route);
    if (reassigning) {
      // Cascade the reassignment to the route's planned visits so the new
      // driver owns them (findByDriver queries filter on planned_visits.driver_id).
      await this.visitRepo.update({ routeId: id }, { driverId: route.driverId });
      this.logger.log(`Route ${id} reassigned to driver ${route.driverId}`);
    }
    return saved;
  }

  /**
   * Recompute a route's status from its visits' progress. Idempotent — call it
   * after any visit status change (manual or geofence auto-arrival).
   *  - planned → in_progress: once any visit has left 'pending'.
   *  - → completed: once every non-cancelled visit is terminal.
   * Never overrides a 'completed' or 'cancelled' route (those are terminal /
   * manual states), so a cancelled route stays cancelled.
   */
  async syncStatusFromVisits(routeId: string): Promise<void> {
    const route = await this.routeRepo.findOne({ where: { id: routeId } });
    if (!route || route.status === 'completed' || route.status === 'cancelled') return;

    const visits = await this.visitRepo.find({ where: { routeId } });
    const active = visits.filter((v) => v.status !== 'cancelled');
    if (active.length === 0) return;

    const TERMINAL = ['completed', 'skipped', 'failed'];
    const allTerminal = active.every((v) => TERMINAL.includes(v.status));
    const anyStarted = active.some((v) => v.status !== 'pending');

    let next = route.status;
    if (allTerminal) next = 'completed';
    else if (route.status === 'planned' && anyStarted) next = 'in_progress';

    if (next !== route.status) {
      await this.routeRepo.update(routeId, { status: next });
      this.logger.log(`Route ${routeId} auto-status: ${route.status} → ${next}`);
    }
  }

  async updateStopCount(id: string, completedStops: number): Promise<void> {
    await this.routeRepo.update(id, { completedStops });
  }

  async incrementTotalStops(id: string): Promise<void> {
    await this.routeRepo.increment({ id }, 'totalStops', 1);
  }

  async decrementTotalStops(id: string): Promise<void> {
    await this.routeRepo.decrement({ id }, 'totalStops', 1);
  }
}
