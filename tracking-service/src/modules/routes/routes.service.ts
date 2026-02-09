import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Route } from './entities/route.entity';
import { CreateRouteDto, UpdateRouteDto } from './dto/route.dto';

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  constructor(
    @InjectRepository(Route, 'cacheDb')
    private readonly routeRepo: Repository<Route>,
  ) {}

  async create(dto: CreateRouteDto): Promise<Route> {
    const route = this.routeRepo.create({
      tenantId: dto.tenantId,
      driverId: dto.driverId,
      scheduledDate: dto.scheduledDate,
      status: 'planned',
      totalStops: 0,
      completedStops: 0,
    });
    const saved = await this.routeRepo.save(route);
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

  async findById(id: string): Promise<Route> {
    const route = await this.routeRepo.findOne({
      where: { id },
      relations: ['visits'],
    });
    if (!route) throw new NotFoundException(`Route ${id} not found`);
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
    return this.routeRepo.save(route);
  }

  async updateStopCount(id: string, completedStops: number): Promise<void> {
    await this.routeRepo.update(id, { completedStops });
  }

  async incrementTotalStops(id: string): Promise<void> {
    await this.routeRepo.increment({ id }, 'totalStops', 1);
  }
}
