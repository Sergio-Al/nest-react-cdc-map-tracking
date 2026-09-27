import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EachMessagePayload } from 'kafkajs';
import { EnrichmentService } from './enrichment.service';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { RedisService } from '../redis/redis.service';
import { CustomerCacheService } from '../customers/customer-cache.service';
import { VisitsService } from '../visits/visits.service';
import { RoutesService } from '../routes/routes.service';
import { TimescaleService } from '../timescale/timescale.service';
import { Driver } from '../drivers/entities/driver.entity';
import { DriverPosition } from '../drivers/entities/driver-position.entity';
import { RawGpsPosition, EnrichedPosition } from './enrichment.types';

const DRIVER = { id: 'drv-1', tenantId: 'tenant-1', name: 'Juan Pérez', deviceId: 'DEV001' };
const CUSTOMER = {
  id: 10,
  name: 'Tienda La Paz',
  latitude: -16.5,
  longitude: -68.15,
  geofenceRadiusMeters: 100,
};

const baseRaw: RawGpsPosition = {
  deviceId: 'DEV001',
  latitude: -16.5,
  longitude: -68.15,
  speed: 36,
  course: 90,
  altitude: 3600,
  accuracy: 5,
  deviceTime: '2026-08-23T12:00:00.000Z',
};

function payloadFor(raw: Partial<RawGpsPosition>): EachMessagePayload {
  return {
    topic: 'gps.positions',
    partition: 0,
    message: { value: Buffer.from(JSON.stringify({ ...baseRaw, ...raw })) },
  } as unknown as EachMessagePayload;
}

describe('EnrichmentService', () => {
  let service: EnrichmentService;
  let handler: (payload: EachMessagePayload) => Promise<void>;
  let kafkaConsumer: { registerHandler: jest.Mock };
  let kafkaProducer: { produce: jest.Mock };
  let redis: { setJson: jest.Mock; geoadd: jest.Mock; zadd: jest.Mock };
  let customerCache: { getById: jest.Mock };
  let visitsService: {
    getCurrentVisitForDriver: jest.Mock;
    getNextVisitForDriver: jest.Mock;
    markArrived: jest.Mock;
  };
  let routesService: { findActiveRouteIdByDriver: jest.Mock };
  let timescale: { insertEnrichedPositionBatch: jest.Mock };
  let driverRepo: { find: jest.Mock; update: jest.Mock };
  let driverPosRepo: { upsert: jest.Mock };

  /** The enriched position published to gps.positions.enriched, parsed back. */
  function publishedEnriched(): EnrichedPosition {
    const call = kafkaProducer.produce.mock.calls.find(
      ([topic]) => topic === 'gps.positions.enriched',
    );
    expect(call).toBeDefined();
    return JSON.parse(call![1].value);
  }

  beforeEach(async () => {
    jest.useFakeTimers();

    kafkaConsumer = { registerHandler: jest.fn() };
    kafkaProducer = { produce: jest.fn().mockResolvedValue(undefined) };
    redis = {
      setJson: jest.fn().mockResolvedValue(undefined),
      geoadd: jest.fn().mockResolvedValue(undefined),
      zadd: jest.fn().mockResolvedValue(undefined),
    };
    customerCache = { getById: jest.fn().mockResolvedValue(null) };
    visitsService = {
      getCurrentVisitForDriver: jest.fn().mockResolvedValue(null),
      getNextVisitForDriver: jest.fn().mockResolvedValue(null),
      markArrived: jest.fn().mockResolvedValue(undefined),
    };
    routesService = { findActiveRouteIdByDriver: jest.fn().mockResolvedValue(null) };
    timescale = { insertEnrichedPositionBatch: jest.fn().mockResolvedValue(undefined) };
    driverRepo = {
      find: jest.fn().mockResolvedValue([DRIVER]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    driverPosRepo = { upsert: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrichmentService,
        { provide: KafkaConsumerService, useValue: kafkaConsumer },
        { provide: KafkaProducerService, useValue: kafkaProducer },
        { provide: RedisService, useValue: redis },
        { provide: CustomerCacheService, useValue: customerCache },
        { provide: VisitsService, useValue: visitsService },
        { provide: RoutesService, useValue: routesService },
        { provide: TimescaleService, useValue: timescale },
        { provide: getRepositoryToken(Driver, 'cacheDb'), useValue: driverRepo },
        { provide: getRepositoryToken(DriverPosition, 'cacheDb'), useValue: driverPosRepo },
      ],
    }).compile();

    service = module.get(EnrichmentService);
    await service.onModuleInit();
    handler = kafkaConsumer.registerHandler.mock.calls[0][0].handler;
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.useRealTimers();
  });

  // ── Device→driver mapping ────────────────────────────────

  describe('device→driver mapping', () => {
    it('registers a consumer on gps.positions with retry policy', () => {
      expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'gps.positions',
          retryPolicy: expect.objectContaining({ maxRetries: 3 }),
        }),
      );
    });

    it('skips positions from unknown devices without touching downstream services', async () => {
      await handler(payloadFor({ deviceId: 'UNKNOWN' }));

      expect(routesService.findActiveRouteIdByDriver).not.toHaveBeenCalled();
      expect(kafkaProducer.produce).not.toHaveBeenCalled();
      expect(driverPosRepo.upsert).not.toHaveBeenCalled();
    });

    it('resolves the driver via attributes.uniqueId when Traccar sends a numeric deviceId', async () => {
      await handler(payloadFor({ deviceId: 12345, attributes: { uniqueId: 'DEV001' } }));

      const enriched = publishedEnriched();
      expect(enriched.driverId).toBe(DRIVER.id);
      expect(enriched.deviceId).toBe('DEV001');
    });

    it('refreshDriverMapping adds a new device mapping live', async () => {
      service.refreshDriverMapping('DEV002', 'drv-2', 'tenant-1', 'Ana Rojas');

      await handler(payloadFor({ deviceId: 'DEV002' }));

      const enriched = publishedEnriched();
      expect(enriched.driverId).toBe('drv-2');
      expect(enriched.driverName).toBe('Ana Rojas');
    });

    it('refreshDriverMapping evicts the previous key when the device changes', async () => {
      service.refreshDriverMapping('DEV009', DRIVER.id, DRIVER.tenantId, DRIVER.name);

      // Old device no longer resolves
      await handler(payloadFor({ deviceId: 'DEV001' }));
      expect(kafkaProducer.produce).not.toHaveBeenCalled();

      // New device does
      await handler(payloadFor({ deviceId: 'DEV009' }));
      expect(publishedEnriched().driverId).toBe(DRIVER.id);
    });

    it('refreshDriverMapping with null device unpairs the driver', async () => {
      service.refreshDriverMapping(null, DRIVER.id, DRIVER.tenantId, DRIVER.name);

      await handler(payloadFor({ deviceId: 'DEV001' }));
      expect(kafkaProducer.produce).not.toHaveBeenCalled();
    });

    it('removeDriverMapping drops the driver from the lookup', async () => {
      service.removeDriverMapping(DRIVER.id);

      await handler(payloadFor({ deviceId: 'DEV001' }));
      expect(kafkaProducer.produce).not.toHaveBeenCalled();
    });
  });

  // ── Enrichment happy path ────────────────────────────────

  describe('enrichment pipeline', () => {
    it('fans out an enriched position to Kafka, Redis and the PG snapshot', async () => {
      routesService.findActiveRouteIdByDriver.mockResolvedValue('route-1');

      await handler(payloadFor({}));

      const enriched = publishedEnriched();
      expect(enriched).toMatchObject({
        driverId: DRIVER.id,
        tenantId: DRIVER.tenantId,
        driverName: DRIVER.name,
        latitude: baseRaw.latitude,
        longitude: baseRaw.longitude,
        speed: baseRaw.speed,
        heading: baseRaw.course,
        routeId: 'route-1',
        time: baseRaw.deviceTime,
      });
      expect(
        kafkaProducer.produce.mock.calls.find(([t]) => t === 'gps.positions.enriched')![1],
      ).toMatchObject({ key: DRIVER.id, headers: { tenantId: DRIVER.tenantId } });

      expect(redis.setJson).toHaveBeenCalledWith(
        `pos:driver:${DRIVER.id}`,
        expect.objectContaining({ driverId: DRIVER.id }),
        expect.any(Number),
      );
      expect(redis.geoadd).toHaveBeenCalledWith(
        `geo:drivers:${DRIVER.tenantId}`,
        baseRaw.longitude,
        baseRaw.latitude,
        DRIVER.id,
      );
      expect(redis.zadd).toHaveBeenCalledWith(
        `active:drivers:${DRIVER.tenantId}`,
        expect.any(Number),
        DRIVER.id,
      );
      expect(driverPosRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ driverId: DRIVER.id, tenantId: DRIVER.tenantId }),
        ['driverId'],
      );
    });

    it('computes distance and eta towards the next visit customer', async () => {
      visitsService.getNextVisitForDriver.mockResolvedValue({
        id: 'visit-1',
        status: 'pending',
        customerId: CUSTOMER.id,
      });
      customerCache.getById.mockResolvedValue(CUSTOMER);

      // ~1112 m south of the customer at 36 km/h (10 m/s) → eta ~111 s
      await handler(payloadFor({ latitude: -16.51 }));

      const enriched = publishedEnriched();
      expect(enriched.nextCustomerName).toBe(CUSTOMER.name);
      expect(enriched.distanceToNextM).toBeCloseTo(1112, -1);
      expect(enriched.etaToNextSec).toBeCloseTo(111, -1);
      expect(enriched.insideGeofence).toBe(false);
      expect(enriched.visitAutoArrival).toBe(false);
      expect(visitsService.markArrived).not.toHaveBeenCalled();
    });

    it('leaves proximity fields null when the customer has no coordinates', async () => {
      visitsService.getNextVisitForDriver.mockResolvedValue({
        id: 'visit-1',
        status: 'pending',
        customerId: CUSTOMER.id,
      });
      customerCache.getById.mockResolvedValue({ ...CUSTOMER, latitude: null, longitude: null });

      await handler(payloadFor({}));

      const enriched = publishedEnriched();
      expect(enriched.distanceToNextM).toBeNull();
      expect(enriched.etaToNextSec).toBeNull();
      expect(enriched.nextCustomerName).toBeNull();
    });

    it('does not reject when the Kafka publish fails (fan-out is allSettled)', async () => {
      kafkaProducer.produce.mockRejectedValue(new Error('broker down'));

      await expect(handler(payloadFor({}))).resolves.toBeUndefined();
      // The other destinations still got the position
      expect(driverPosRepo.upsert).toHaveBeenCalled();
      expect(redis.setJson).toHaveBeenCalled();
    });

    it('marks the driver active once, not on every position', async () => {
      await handler(payloadFor({}));
      await handler(payloadFor({}));

      expect(driverRepo.update).toHaveBeenCalledTimes(1);
      expect(driverRepo.update).toHaveBeenCalledWith(DRIVER.id, { status: 'active' });
    });

    it('flushes buffered history rows to TimescaleDB on shutdown', async () => {
      await handler(payloadFor({}));
      expect(timescale.insertEnrichedPositionBatch).not.toHaveBeenCalled();

      await service.onModuleDestroy();

      expect(timescale.insertEnrichedPositionBatch).toHaveBeenCalledTimes(1);
      const batch = timescale.insertEnrichedPositionBatch.mock.calls[0][0];
      expect(batch).toHaveLength(1);
      expect(batch[0]).toMatchObject({ driverId: DRIVER.id, tenantId: DRIVER.tenantId });
    });
  });

  // ── Geofence auto-arrival ────────────────────────────────

  describe('geofence auto-arrival', () => {
    const pendingVisit = { id: 'visit-1', status: 'pending', customerId: CUSTOMER.id };

    it('auto-marks the next pending visit as arrived when entering the geofence', async () => {
      visitsService.getNextVisitForDriver.mockResolvedValue(pendingVisit);
      customerCache.getById.mockResolvedValue(CUSTOMER);

      // Position exactly at the customer → inside the 100 m fence
      await handler(payloadFor({ latitude: CUSTOMER.latitude, longitude: CUSTOMER.longitude }));

      expect(visitsService.markArrived).toHaveBeenCalledWith('visit-1');
      const enriched = publishedEnriched();
      expect(enriched.insideGeofence).toBe(true);
      expect(enriched.geofenceCustomerId).toBe(CUSTOMER.id);
      expect(enriched.visitAutoArrival).toBe(true);
    });

    it('also auto-arrives from en_route status', async () => {
      visitsService.getNextVisitForDriver.mockResolvedValue({ ...pendingVisit, status: 'en_route' });
      customerCache.getById.mockResolvedValue(CUSTOMER);

      await handler(payloadFor({}));

      expect(visitsService.markArrived).toHaveBeenCalledWith('visit-1');
    });

    it('does not auto-arrive while a visit is already in progress at the fence', async () => {
      // Current visit wins as the proximity target; no pending "next" transition to fire
      visitsService.getCurrentVisitForDriver.mockResolvedValue({
        id: 'visit-0',
        status: 'in_progress',
        customerId: CUSTOMER.id,
      });
      customerCache.getById.mockResolvedValue(CUSTOMER);

      await handler(payloadFor({}));

      expect(visitsService.markArrived).not.toHaveBeenCalled();
      expect(publishedEnriched().insideGeofence).toBe(true);
    });

    it('survives a markArrived failure and reports visitAutoArrival=false', async () => {
      visitsService.getNextVisitForDriver.mockResolvedValue(pendingVisit);
      customerCache.getById.mockResolvedValue(CUSTOMER);
      visitsService.markArrived.mockRejectedValue(new Error('db down'));

      await expect(handler(payloadFor({}))).resolves.toBeUndefined();

      const enriched = publishedEnriched();
      expect(enriched.insideGeofence).toBe(true);
      expect(enriched.visitAutoArrival).toBe(false);
    });
  });
});
