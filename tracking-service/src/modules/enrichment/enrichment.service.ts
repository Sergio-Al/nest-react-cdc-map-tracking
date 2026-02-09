import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EachMessagePayload } from 'kafkajs';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { RedisService } from '../redis/redis.service';
import { CustomerCacheService } from '../customers/customer-cache.service';
import { VisitsService } from '../visits/visits.service';
import { RoutesService } from '../routes/routes.service';
import { TimescaleService, EnrichedPositionRow } from '../timescale/timescale.service';
import { Driver } from '../drivers/entities/driver.entity';
import { DriverPosition } from '../drivers/entities/driver-position.entity';
import {
  haversineDistanceM,
  estimateEtaSeconds,
  isInsideGeofence,
} from './geo-utils';
import { RawGpsPosition, EnrichedPosition } from './enrichment.types';

const REDIS_LATEST_POS_TTL = 300; // 5 minutes
const REDIS_DRIVER_POS_PREFIX = 'pos:driver:';
const REDIS_GEO_KEY = 'geo:drivers';

@Injectable()
export class EnrichmentService implements OnModuleInit {
  private readonly logger = new Logger(EnrichmentService.name);

  /** In-memory device→driver map for fast lookups */
  private deviceDriverMap = new Map<
    string,
    { driverId: string; tenantId: string; name: string }
  >();

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly redis: RedisService,
    private readonly customerCache: CustomerCacheService,
    private readonly visitsService: VisitsService,
    private readonly routesService: RoutesService,
    private readonly timescale: TimescaleService,
    @InjectRepository(Driver, 'cacheDb')
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(DriverPosition, 'cacheDb')
    private readonly driverPosRepo: Repository<DriverPosition>,
  ) {}

  async onModuleInit() {
    // Pre-load device→driver mapping
    await this.loadDeviceDriverMap();

    // Register as consumer for raw GPS positions
    this.kafkaConsumer.registerHandler({
      topic: 'gps.positions',
      fromBeginning: false,
      handler: this.handleRawPosition.bind(this),
    });

    this.logger.log('Enrichment service initialized, consuming gps.positions');
  }

  // ── Load driver mappings on startup ──────────────────────

  private async loadDeviceDriverMap(): Promise<void> {
    const drivers = await this.driverRepo.find();
    for (const d of drivers) {
      if (d.deviceId) {
        this.deviceDriverMap.set(d.deviceId, {
          driverId: d.id,
          tenantId: d.tenantId,
          name: d.name,
        });
      }
    }
    this.logger.log(`Loaded ${this.deviceDriverMap.size} device→driver mappings`);
  }

  /** Called externally when a new driver is added/updated */
  refreshDriverMapping(deviceId: string, driverId: string, tenantId: string, name: string): void {
    this.deviceDriverMap.set(deviceId, { driverId, tenantId, name });
  }

  // ── Main enrichment pipeline ─────────────────────────────

  private async handleRawPosition(payload: EachMessagePayload): Promise<void> {
    const raw: RawGpsPosition = JSON.parse(payload.message.value!.toString());

    // 1. Resolve driver from deviceId
    //    Traccar sends numeric deviceId; the driver mapping uses the
    //    human-readable uniqueId from attributes (e.g. "DEV001").
    const lookupKey =
      (raw.attributes?.uniqueId as string | undefined) ??
      String(raw.deviceId);

    const driverInfo = this.deviceDriverMap.get(lookupKey);
    if (!driverInfo) {
      this.logger.debug(`Unknown device ${lookupKey} (raw=${raw.deviceId}), skipping enrichment`);
      return;
    }

    const { driverId, tenantId, name: driverName } = driverInfo;

    // 2. Get route & visit context
    const activeRoute = await this.routesService.findActiveByDriver(driverId);
    const currentVisit = await this.visitsService.getCurrentVisitForDriver(driverId);
    const nextVisit = await this.visitsService.getNextVisitForDriver(driverId);

    // 3. Calculate proximity to next customer
    let distanceToNextM: number | null = null;
    let etaToNextSec: number | null = null;
    let nextCustomerName: string | null = null;
    let nextCustomerLat: number | null = null;
    let nextCustomerLon: number | null = null;
    let insideGeofence = false;
    let geofenceCustomerId: number | null = null;
    let visitAutoArrival = false;

    const targetVisit = currentVisit || nextVisit;
    if (targetVisit) {
      const customer = await this.customerCache.getById(targetVisit.customerId);
      if (customer && customer.latitude != null && customer.longitude != null) {
        nextCustomerName = customer.name;
        nextCustomerLat = customer.latitude;
        nextCustomerLon = customer.longitude;

        distanceToNextM = haversineDistanceM(
          raw.latitude,
          raw.longitude,
          customer.latitude,
          customer.longitude,
        );
        etaToNextSec = estimateEtaSeconds(distanceToNextM, raw.speed);

        // Geofence detection
        insideGeofence = isInsideGeofence(
          raw.latitude,
          raw.longitude,
          customer.latitude,
          customer.longitude,
          customer.geofenceRadiusMeters,
        );

        if (insideGeofence) {
          geofenceCustomerId = customer.id;
          // Auto-arrival: if next visit is pending/en_route and driver entered geofence
          if (
            nextVisit &&
            (nextVisit.status === 'pending' || nextVisit.status === 'en_route')
          ) {
            try {
              await this.visitsService.markArrived(nextVisit.id);
              visitAutoArrival = true;
              this.logger.log(
                `Auto-arrival: driver ${driverName} arrived at ${customer.name} (visit ${nextVisit.id})`,
              );
            } catch (err) {
              this.logger.error(`Failed auto-arrival for visit ${nextVisit.id}`, err);
            }
          }
        }
      }
    }

    // 4. Build enriched position
    const enriched: EnrichedPosition = {
      time: raw.deviceTime || raw.fixTime || raw.serverTime || new Date().toISOString(),
      driverId,
      tenantId,
      driverName,
      deviceId: lookupKey,
      latitude: raw.latitude,
      longitude: raw.longitude,
      speed: raw.speed,
      heading: raw.course,
      altitude: raw.altitude,
      accuracy: raw.accuracy || null,
      routeId: activeRoute?.id || null,
      currentVisitId: currentVisit?.id || null,
      nextVisitId: nextVisit?.id || null,
      nextCustomerName,
      nextCustomerLat,
      nextCustomerLon,
      distanceToNextM,
      etaToNextSec,
      insideGeofence,
      geofenceCustomerId,
      visitAutoArrival,
    };

    // 5. Fan-out: write to all destinations in parallel
    await Promise.all([
      this.updateRedisLatestPosition(driverId, tenantId, enriched),
      this.updateDriverPositionSnapshot(driverId, tenantId, enriched),
      this.writeToTimescale(enriched),
      this.publishEnrichedToKafka(enriched),
    ]);

    // 6. Update driver status to 'active' if offline
    await this.ensureDriverActive(driverId);
  }

  // ── Redis latest position ────────────────────────────────

  private async updateRedisLatestPosition(
    driverId: string,
    tenantId: string,
    enriched: EnrichedPosition,
  ): Promise<void> {
    try {
      // Store as JSON for quick full-position lookup
      await this.redis.setJson(
        `${REDIS_DRIVER_POS_PREFIX}${driverId}`,
        enriched,
        REDIS_LATEST_POS_TTL,
      );

      // Update GeoHash for proximity queries
      await this.redis.geoadd(
        `${REDIS_GEO_KEY}:${tenantId}`,
        enriched.longitude,
        enriched.latitude,
        driverId,
      );
    } catch (err) {
      this.logger.error(`Failed to update Redis position for ${driverId}`, err);
    }
  }

  // ── Local PG driver_positions snapshot ────────────────────

  private async updateDriverPositionSnapshot(
    driverId: string,
    tenantId: string,
    enriched: EnrichedPosition,
  ): Promise<void> {
    try {
      await this.driverPosRepo.upsert(
        {
          driverId,
          tenantId,
          latitude: enriched.latitude,
          longitude: enriched.longitude,
          speed: enriched.speed,
          heading: enriched.heading,
          altitude: enriched.altitude,
          accuracy: enriched.accuracy,
          currentRouteId: enriched.routeId,
          currentVisitId: enriched.currentVisitId,
          nextVisitId: enriched.nextVisitId,
          distanceToNextM: enriched.distanceToNextM,
          etaToNextSec: enriched.etaToNextSec,
          updatedAt: new Date(),
        },
        ['driverId'],
      );
    } catch (err) {
      this.logger.error(`Failed to update PG position for ${driverId}`, err);
    }
  }

  // ── TimescaleDB historical write ─────────────────────────

  private async writeToTimescale(enriched: EnrichedPosition): Promise<void> {
    try {
      const row: EnrichedPositionRow = {
        time: new Date(enriched.time),
        driverId: enriched.driverId,
        tenantId: enriched.tenantId,
        latitude: enriched.latitude,
        longitude: enriched.longitude,
        speed: enriched.speed,
        heading: enriched.heading,
        altitude: enriched.altitude,
        accuracy: enriched.accuracy,
        routeId: enriched.routeId,
        visitId: enriched.currentVisitId || enriched.nextVisitId,
        customerName: enriched.nextCustomerName,
        distanceToNextM: enriched.distanceToNextM,
        etaToNextSec: enriched.etaToNextSec,
      };
      await this.timescale.insertEnrichedPosition(row);
    } catch (err) {
      this.logger.error(`Failed to write to TimescaleDB`, err);
    }
  }

  // ── Kafka enriched topic ──────────────────────────────────

  private async publishEnrichedToKafka(enriched: EnrichedPosition): Promise<void> {
    try {
      await this.kafkaProducer.produce('gps.positions.enriched', {
        key: enriched.driverId,
        value: JSON.stringify(enriched),
        headers: { tenantId: enriched.tenantId },
      });
    } catch (err) {
      this.logger.error(`Failed to publish enriched position to Kafka`, err);
    }
  }

  // ── Driver status management ─────────────────────────────

  private async ensureDriverActive(driverId: string): Promise<void> {
    try {
      await this.driverRepo.update(driverId, { status: 'active' });
    } catch {
      // Non-critical
    }
  }
}
