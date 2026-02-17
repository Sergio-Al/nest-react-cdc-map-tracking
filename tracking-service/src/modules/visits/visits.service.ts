import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlannedVisit } from './entities/planned-visit.entity';
import { CreateVisitDto, UpdateVisitStatusDto } from './dto/visit.dto';
import { RoutesService } from '../routes/routes.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    @InjectRepository(PlannedVisit, 'cacheDb')
    private readonly visitRepo: Repository<PlannedVisit>,
    @Inject(forwardRef(() => RoutesService))
    private readonly routesService: RoutesService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  async create(dto: CreateVisitDto): Promise<PlannedVisit> {
    const visit = this.visitRepo.create({
      tenantId: dto.tenantId,
      routeId: dto.routeId,
      driverId: dto.driverId,
      customerId: dto.customerId,
      sequenceNumber: dto.sequenceNumber,
      visitType: dto.visitType || 'delivery',
      scheduledDate: dto.scheduledDate,
      timeWindowStart: dto.timeWindowStart || null,
      timeWindowEnd: dto.timeWindowEnd || null,
      notes: dto.notes || null,
      status: 'pending',
    });
    const saved = await this.visitRepo.save(visit);
    await this.routesService.incrementTotalStops(dto.routeId);
    this.logger.log(`Visit created: ${saved.id} (route=${dto.routeId}, seq=${dto.sequenceNumber})`);
    return saved;
  }

  async findById(id: string): Promise<PlannedVisit> {
    const visit = await this.visitRepo.findOne({ where: { id } });
    if (!visit) throw new NotFoundException(`Visit ${id} not found`);
    return visit;
  }

  async findByRoute(routeId: string): Promise<PlannedVisit[]> {
    return this.visitRepo.find({
      where: { routeId },
      order: { sequenceNumber: 'ASC' },
    });
  }

  async findByDriver(driverId: string, date?: string): Promise<PlannedVisit[]> {
    const qb = this.visitRepo
      .createQueryBuilder('v')
      .where('v.driver_id = :driverId', { driverId })
      .orderBy('v.sequence_number', 'ASC');
    if (date) {
      qb.andWhere('v.scheduled_date = :date', { date });
    }
    return qb.getMany();
  }

  /**
   * Get the next pending visit for a driver on an active route
   */
  async getNextVisitForDriver(driverId: string): Promise<PlannedVisit | null> {
    return this.visitRepo
      .createQueryBuilder('v')
      .where('v.driver_id = :driverId', { driverId })
      .andWhere('v.status IN (:...statuses)', { statuses: ['pending', 'en_route'] })
      .orderBy('v.sequence_number', 'ASC')
      .getOne();
  }

  /**
   * Get current in-progress visit for a driver
   */
  async getCurrentVisitForDriver(driverId: string): Promise<PlannedVisit | null> {
    return this.visitRepo.findOne({
      where: { driverId, status: 'in_progress' },
    });
  }

  /**
   * Update visit status with lifecycle management
   */
  async updateStatus(id: string, dto: UpdateVisitStatusDto): Promise<PlannedVisit> {
    const visit = await this.findById(id);
    const previousStatus = visit.status;
    visit.status = dto.status;
    if (dto.notes) visit.notes = dto.notes;
    const now = new Date();

    switch (dto.status) {
      case 'arrived':
        visit.arrivedAt = now;
        break;
      case 'completed':
        visit.completedAt = now;
        // Update route's completed stops count
        const completedCount = await this.visitRepo.count({
          where: { routeId: visit.routeId, status: 'completed' },
        });
        await this.routesService.updateStopCount(visit.routeId, completedCount + 1);
        break;
      case 'skipped':
      case 'failed':
        visit.departedAt = now;
        break;
    }

    const saved = await this.visitRepo.save(visit);

    // Publish visit event to Kafka
    await this.publishVisitEvent(saved, previousStatus);

    this.logger.log(`Visit ${id} status: ${previousStatus} → ${dto.status}`);
    return saved;
  }

  /**
   * Auto-arrival: called by enrichment service when driver enters customer geofence
   */
  async markArrived(id: string): Promise<PlannedVisit> {
    return this.updateStatus(id, { status: 'arrived' });
  }

  /**
   * Delete a pending visit. Only allowed for visits with status 'pending'.
   */
  async delete(id: string): Promise<void> {
    const visit = await this.findById(id);
    if (visit.status !== 'pending') {
      throw new BadRequestException(`Cannot delete visit in '${visit.status}' status`);
    }
    await this.visitRepo.remove(visit);
    await this.routesService.decrementTotalStops(visit.routeId);
    this.logger.log(`Visit deleted: ${id} (route=${visit.routeId})`);
  }

  /**
   * Auto-departure: called when driver leaves customer geofence
   */
  async markDeparted(id: string): Promise<void> {
    const visit = await this.findById(id);
    if (visit.status === 'arrived' || visit.status === 'in_progress') {
      visit.departedAt = new Date();
      await this.visitRepo.save(visit);
    }
  }

  private async publishVisitEvent(visit: PlannedVisit, previousStatus: string): Promise<void> {
    try {
      await this.kafkaProducer.produce('visits.events', {
        key: visit.id,
        value: JSON.stringify({
          visitId: visit.id,
          routeId: visit.routeId,
          driverId: visit.driverId,
          customerId: visit.customerId,
          tenantId: visit.tenantId,
          previousStatus,
          currentStatus: visit.status,
          visitType: visit.visitType,
          arrivedAt: visit.arrivedAt,
          completedAt: visit.completedAt,
          timestamp: new Date().toISOString(),
        }),
        headers: { tenantId: visit.tenantId },
      });
    } catch (error) {
      this.logger.error(`Failed to publish visit event for ${visit.id}`, error);
    }
  }
}
