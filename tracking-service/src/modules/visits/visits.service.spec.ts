import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { PlannedVisit } from './entities/planned-visit.entity';
import { RoutesService } from '../routes/routes.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { OrdersService } from '../orders/orders.service';
import { TimescaleService } from '../timescale/timescale.service';

function makeVisit(overrides: Partial<PlannedVisit> = {}): PlannedVisit {
  return {
    id: 'visit-1',
    tenantId: 'tenant-1',
    routeId: 'route-1',
    driverId: 'drv-1',
    customerId: 10,
    orderId: null,
    sequenceNumber: 1,
    visitType: 'delivery',
    scheduledDate: '2026-08-23',
    timeWindowStart: null,
    timeWindowEnd: null,
    status: 'pending',
    arrivedAt: null,
    departedAt: null,
    completedAt: null,
    notes: null,
    estimatedArrivalTime: null,
    estimatedTravelSeconds: null,
    estimatedDistanceMeters: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PlannedVisit;
}

describe('VisitsService', () => {
  let service: VisitsService;
  let visitRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let routesService: {
    incrementTotalStops: jest.Mock;
    decrementTotalStops: jest.Mock;
    recountCompletedStops: jest.Mock;
    syncStatusFromVisits: jest.Mock;
  };
  let kafkaProducer: { produce: jest.Mock };
  let ordersService: { setOrderStatus: jest.Mock };
  let timescale: { insertVisitCompletion: jest.Mock };
  let queryBuilder: any;

  /** The visits.events payload published for a given visit, parsed back. */
  function publishedEvent(): any {
    const call = kafkaProducer.produce.mock.calls.find(([topic]) => topic === 'visits.events');
    expect(call).toBeDefined();
    return JSON.parse(call![1].value);
  }

  beforeEach(async () => {
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getMany: jest.fn().mockResolvedValue([]),
    };
    visitRepo = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    routesService = {
      incrementTotalStops: jest.fn().mockResolvedValue(undefined),
      decrementTotalStops: jest.fn().mockResolvedValue(undefined),
      recountCompletedStops: jest.fn().mockResolvedValue(undefined),
      syncStatusFromVisits: jest.fn().mockResolvedValue(undefined),
    };
    kafkaProducer = { produce: jest.fn().mockResolvedValue(undefined) };
    ordersService = { setOrderStatus: jest.fn().mockResolvedValue(undefined) };
    timescale = { insertVisitCompletion: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitsService,
        { provide: getRepositoryToken(PlannedVisit, 'cacheDb'), useValue: visitRepo },
        { provide: RoutesService, useValue: routesService },
        { provide: KafkaProducerService, useValue: kafkaProducer },
        { provide: OrdersService, useValue: ordersService },
        { provide: TimescaleService, useValue: timescale },
      ],
    }).compile();

    service = module.get(VisitsService);
  });

  // ── create / findById / delete ───────────────────────────

  describe('create', () => {
    it('saves the visit as pending and increments the route stop count', async () => {
      const saved = await service.create({
        tenantId: 'tenant-1',
        routeId: 'route-1',
        driverId: 'drv-1',
        customerId: 10,
        sequenceNumber: 3,
        scheduledDate: '2026-08-23',
      } as any);

      expect(saved.status).toBe('pending');
      expect(saved.visitType).toBe('delivery'); // default
      expect(visitRepo.save).toHaveBeenCalled();
      expect(routesService.incrementTotalStops).toHaveBeenCalledWith('route-1');
    });
  });

  describe('findById', () => {
    it('throws NotFoundException when the visit does not exist', async () => {
      await expect(service.findById('nope')).rejects.toThrow(NotFoundException);
    });

    it('scopes the lookup by tenant when a tenantId is given', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit());

      await service.findById('visit-1', 'tenant-1');

      expect(visitRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'visit-1', tenantId: 'tenant-1' },
      });
    });
  });

  describe('delete', () => {
    it('removes a pending visit and decrements the route stop count', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit({ status: 'pending' }));

      await service.delete('visit-1');

      expect(visitRepo.remove).toHaveBeenCalled();
      expect(routesService.decrementTotalStops).toHaveBeenCalledWith('route-1');
    });

    it('refuses to delete a non-pending visit', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit({ status: 'completed' }));

      await expect(service.delete('visit-1')).rejects.toThrow(BadRequestException);
      expect(visitRepo.remove).not.toHaveBeenCalled();
    });
  });

  // ── updateStatus lifecycle ───────────────────────────────

  describe('updateStatus', () => {
    it('is an idempotent no-op when the visit is already in the target status', async () => {
      const visit = makeVisit({ status: 'arrived', arrivedAt: new Date('2026-08-23T10:00:00Z') });
      visitRepo.findOne.mockResolvedValue(visit);

      const result = await service.updateStatus('visit-1', { status: 'arrived' } as any);

      expect(result).toBe(visit);
      expect(visitRepo.save).not.toHaveBeenCalled();
      expect(kafkaProducer.produce).not.toHaveBeenCalled();
      expect(routesService.recountCompletedStops).not.toHaveBeenCalled();
      expect(timescale.insertVisitCompletion).not.toHaveBeenCalled();
    });

    it('stamps arrivedAt on arrival, publishes the event and syncs the route', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit({ status: 'en_route' }));

      const result = await service.updateStatus('visit-1', { status: 'arrived' } as any);

      expect(result.arrivedAt).toBeInstanceOf(Date);
      expect(result.completedAt).toBeNull();
      expect(routesService.recountCompletedStops).toHaveBeenCalledWith('route-1');
      expect(routesService.syncStatusFromVisits).toHaveBeenCalledWith('route-1');
      expect(publishedEvent()).toMatchObject({
        visitId: 'visit-1',
        previousStatus: 'en_route',
        currentStatus: 'arrived',
        tenantId: 'tenant-1',
      });
      // Arrival is not terminal — no history row yet
      expect(timescale.insertVisitCompletion).not.toHaveBeenCalled();
    });

    it('stamps completedAt on completion and records the visit to history once', async () => {
      visitRepo.findOne.mockResolvedValue(
        makeVisit({ status: 'in_progress', arrivedAt: new Date(Date.now() - 120_000) }),
      );

      const result = await service.updateStatus('visit-1', { status: 'completed' } as any);

      expect(result.completedAt).toBeInstanceOf(Date);
      expect(timescale.insertVisitCompletion).toHaveBeenCalledTimes(1);
      expect(timescale.insertVisitCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          visitId: 'visit-1',
          status: 'completed',
          durationSec: 120, // completedAt - arrivedAt
        }),
      );
    });

    it('stamps departedAt for skipped and failed visits and records them to history', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit({ status: 'en_route' }));

      const result = await service.updateStatus('visit-1', { status: 'skipped' } as any);

      expect(result.departedAt).toBeInstanceOf(Date);
      expect(timescale.insertVisitCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'skipped' }),
      );
    });

    it('flags a late completion as not on time', async () => {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
      visitRepo.findOne.mockResolvedValue(
        makeVisit({ status: 'in_progress', scheduledDate: yesterday, timeWindowEnd: '10:00:00' }),
      );

      await service.updateStatus('visit-1', { status: 'completed' } as any);

      expect(timescale.insertVisitCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ onTime: false }),
      );
    });

    it('flags a completion within the time window as on time', async () => {
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
      visitRepo.findOne.mockResolvedValue(
        makeVisit({ status: 'in_progress', scheduledDate: tomorrow, timeWindowEnd: '23:59:59' }),
      );

      await service.updateStatus('visit-1', { status: 'completed' } as any);

      expect(timescale.insertVisitCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ onTime: true }),
      );
    });

    it('completes the linked order when a visit with an orderId completes', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit({ status: 'in_progress', orderId: 555 }));

      await service.updateStatus('visit-1', { status: 'completed' } as any);

      expect(ordersService.setOrderStatus).toHaveBeenCalledWith(
        'tenant-1',
        555,
        'completed',
        expect.objectContaining({ visitId: 'visit-1', driverId: 'drv-1' }),
      );
    });

    it('does not touch orders for visits without an orderId', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit({ status: 'in_progress', orderId: null }));

      await service.updateStatus('visit-1', { status: 'completed' } as any);

      expect(ordersService.setOrderStatus).not.toHaveBeenCalled();
    });

    it('still completes the visit when the order update fails', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit({ status: 'in_progress', orderId: 555 }));
      ordersService.setOrderStatus.mockRejectedValue(new Error('orders down'));

      const result = await service.updateStatus('visit-1', { status: 'completed' } as any);

      expect(result.status).toBe('completed');
    });

    it('still completes the visit when the Kafka event publish fails', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit({ status: 'in_progress' }));
      kafkaProducer.produce.mockRejectedValue(new Error('broker down'));

      const result = await service.updateStatus('visit-1', { status: 'completed' } as any);

      expect(result.status).toBe('completed');
    });

    it('still completes the visit when the history write fails', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit({ status: 'in_progress' }));
      timescale.insertVisitCompletion.mockRejectedValue(new Error('timescale down'));

      const result = await service.updateStatus('visit-1', { status: 'completed' } as any);

      expect(result.status).toBe('completed');
    });
  });

  // ── markArrived / markDeparted ───────────────────────────

  describe('markArrived', () => {
    it('transitions the visit to arrived (geofence auto-arrival entry point)', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit({ status: 'pending' }));

      const result = await service.markArrived('visit-1');

      expect(result.status).toBe('arrived');
      expect(result.arrivedAt).toBeInstanceOf(Date);
    });
  });

  describe('markDeparted', () => {
    const arrivedAt = new Date('2026-09-26T14:00:00Z');

    it('stamps departedAt for an arrived visit', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit({ status: 'arrived', arrivedAt }));

      await service.markDeparted('visit-1');

      expect(visitRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ departedAt: expect.any(Date) }),
      );
    });

    it('stamps departedAt for a visit completed before the driver drove off', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit({ status: 'completed', arrivedAt }));

      await service.markDeparted('visit-1');

      expect(visitRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed', departedAt: expect.any(Date) }),
      );
    });

    it('never overwrites an existing departure', async () => {
      const departedAt = new Date('2026-09-26T14:10:00Z');
      visitRepo.findOne.mockResolvedValue(
        makeVisit({ status: 'completed', arrivedAt, departedAt }),
      );

      await service.markDeparted('visit-1');

      expect(visitRepo.save).not.toHaveBeenCalled();
    });

    it('ignores departure for a visit the driver never arrived at', async () => {
      visitRepo.findOne.mockResolvedValue(makeVisit({ status: 'pending' }));

      await service.markDeparted('visit-1');

      expect(visitRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getOnSiteVisitForDriver', () => {
    it('finds the latest arrived-but-not-departed visit scheduled today or later', async () => {
      const onSite = makeVisit({ id: 'visit-5', status: 'completed' });
      queryBuilder.getOne.mockResolvedValue(onSite);

      const result = await service.getOnSiteVisitForDriver('drv-1');

      expect(result).toBe(onSite);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('v.status IN (:...statuses)', {
        statuses: ['arrived', 'in_progress', 'completed'],
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('v.departed_at IS NULL');
      expect(queryBuilder.orderBy).toHaveBeenCalledWith('v.arrived_at', 'DESC');
    });
  });

  // ── Driver context queries ───────────────────────────────

  describe('getNextVisitForDriver', () => {
    it('only considers pending/en_route visits scheduled today or later', async () => {
      const next = makeVisit({ id: 'visit-9', status: 'pending' });
      queryBuilder.getOne.mockResolvedValue(next);

      const result = await service.getNextVisitForDriver('drv-1');

      expect(result).toBe(next);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('v.status IN (:...statuses)', {
        statuses: ['pending', 'en_route'],
      });
      const today = new Date().toISOString().split('T')[0];
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('v.scheduled_date >= :today', { today });
    });
  });

  describe('getCurrentVisitForDriver', () => {
    it('looks up the in-progress visit for the driver', async () => {
      await service.getCurrentVisitForDriver('drv-1');

      expect(visitRepo.findOne).toHaveBeenCalledWith({
        where: { driverId: 'drv-1', status: 'in_progress' },
      });
    });
  });
});
