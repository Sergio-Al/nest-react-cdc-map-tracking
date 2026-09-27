import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlannedVisit } from '../visits/entities/planned-visit.entity';
import { TimescaleService } from '../timescale/timescale.service';
import { buildDriverEvents, DriverEvent, VisitTimes } from './driver-events';

@Injectable()
export class DriverEventsService {
  constructor(
    @InjectRepository(PlannedVisit, 'cacheDb')
    private readonly visitRepo: Repository<PlannedVisit>,
    private readonly timescale: TimescaleService,
  ) {}

  async getEvents(driverId: string, tenantId: string, from: Date, to: Date): Promise<DriverEvent[]> {
    const [visits, positions] = await Promise.all([
      this.visitsTouching(driverId, tenantId, from, to),
      this.timescale.getDriverSpeedSamples(driverId, from, to, tenantId),
    ]);
    return buildDriverEvents(
      visits,
      positions.map((p) => ({ time: new Date(p.time), speed: Number(p.speed) || 0 })),
      from,
      to,
    );
  }

  /**
   * Visits with a lifecycle timestamp inside the window — or already on site when
   * it opens (their on-site time must not count as idle) — with the customer's name.
   */
  private async visitsTouching(
    driverId: string,
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<VisitTimes[]> {
    const rows: {
      id: string;
      status: string;
      customer_name: string | null;
      arrived_at: Date | null;
      completed_at: Date | null;
      departed_at: Date | null;
    }[] = await this.visitRepo
      .createQueryBuilder('v')
      .leftJoin('customers_cache', 'c', 'c.id = v.customer_id AND c.tenant_id = v.tenant_id')
      .select([
        'v.id AS id',
        'v.status AS status',
        'c.name AS customer_name',
        'v.arrived_at AS arrived_at',
        'v.completed_at AS completed_at',
        'v.departed_at AS departed_at',
      ])
      .where('v.driver_id = :driverId', { driverId })
      .andWhere('v.tenant_id = :tenantId', { tenantId })
      .andWhere(
        '(v.arrived_at BETWEEN :from AND :to OR v.completed_at BETWEEN :from AND :to ' +
          'OR v.departed_at BETWEEN :from AND :to ' +
          'OR (v.arrived_at < :from AND (v.departed_at IS NULL OR v.departed_at >= :from)))',
        { from, to },
      )
      .getRawMany();

    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      customerName: r.customer_name,
      arrivedAt: r.arrived_at ? new Date(r.arrived_at) : null,
      completedAt: r.completed_at ? new Date(r.completed_at) : null,
      departedAt: r.departed_at ? new Date(r.departed_at) : null,
    }));
  }
}
