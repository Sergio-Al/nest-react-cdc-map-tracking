import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
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
const REDIS_ACTIVE_SET_PREFIX = 'active:drivers:'; // per-tenant ZSET, score = last-seen ms
const TIMESCALE_FLUSH_INTERVAL_MS = 1000;
const TIMESCALE_FLUSH_THRESHOLD = 100;

@Injectable()
export class EnrichmentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EnrichmentService.name);

  /** In-memory device→driver map for fast lookups */
  private deviceDriverMap = new Map<
    string,
    { driverId: string; tenantId: string; name: string }
  >();

  /** Reverse driver→device index so a changed/cleared device_id can evict its stale key. */
  private driverDeviceIndex = new Map<string, string>();

  /** Drivers already marked 'active' this process — skip the redundant per-message status UPDATE. */
  private activeDrivers = new Set<string>();

  /** Buffer of enriched rows pending a batched TimescaleDB write. */
  private timescaleBuffer: EnrichedPositionRow[] = [];
  private flushTimer?: NodeJS.Timeout;
  private activeResetTimer?: NodeJS.Timeout;

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

    // Register as consumer for raw GPS positions (with retry + DLQ)
    this.kafkaConsumer.registerHandler({
      topic: 'gps.positions',
      fromBeginning: false,
      handler: this.handleRawPosition.bind(this),
      retryPolicy: { maxRetries: 3, baseDelayMs: 100 },
    });

    // Flush the TimescaleDB write buffer on an interval (also flushes early when
    // it hits the size threshold) — one transaction per batch instead of an
    // INSERT per position.
    this.flushTimer = setInterval(
      () => void this.flushTimescale(),
      TIMESCALE_FLUSH_INTERVAL_MS,
    );
    // Periodically forget the "already active" set so external status drift
    // (manual deactivate/reactivate) re-asserts within a few minutes.
    this.activeResetTimer = setInterval(
      () => this.activeDrivers.clear(),
      5 * 60 * 1000,
    );

    this.logger.log('Enrichment service initialized, consuming gps.positions');
  }

  async onModuleDestroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.activeResetTimer) clearInterval(this.activeResetTimer);
    await this.flushTimescale(); // don't lose buffered history on shutdown
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
        this.driverDeviceIndex.set(d.id, d.deviceId);
      }
    }
    this.logger.log(`Loaded ${this.deviceDriverMap.size} device→driver mappings`);
  }

  /**
   * Apply a driver insert/update to the in-memory map without a restart.
   * Called by the CDC consumer on `cdc.drivers` upserts. Handles a changed or
   * cleared device_id by evicting the driver's previous key first.
   */
  refreshDriverMapping(
    deviceId: string | null,
    driverId: string,
    tenantId: string,
    name: string,
  ): void {
    const prevDeviceId = this.driverDeviceIndex.get(driverId);
    if (prevDeviceId && prevDeviceId !== deviceId) {
      this.deviceDriverMap.delete(prevDeviceId);
    }

    if (deviceId) {
      this.deviceDriverMap.set(deviceId, { driverId, tenantId, name });
      this.driverDeviceIndex.set(driverId, deviceId);
      this.logger.debug(`Mapping updated: ${deviceId} → ${name} (${driverId})`);
    } else {
      // Driver no longer has a device — drop it from the lookup.
      this.driverDeviceIndex.delete(driverId);
    }
  }

  /** Remove a driver from the map (called by the CDC consumer on delete). */
  removeDriverMapping(driverId: string): void {
    const deviceId = this.driverDeviceIndex.get(driverId);
    if (deviceId) this.deviceDriverMap.delete(deviceId);
    this.driverDeviceIndex.delete(driverId);
    this.logger.debug(`Mapping removed for driver ${driverId}`);
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

    // 2. Get route & visit context. Route lookup is id-only (no visits eager-
    //    load) since the hot path only needs the id.
    const activeRouteId = await this.routesService.findActiveRouteIdByDriver(driverId);
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
      routeId: activeRouteId,
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

    // 5a. Buffer the TimescaleDB history write (flushed in batches, not per msg).
    this.bufferForTimescale(enriched);

    // 5b. Fan-out the remaining destinations in parallel (allSettled for resilience)
    const fanOutResults = await Promise.allSettled([
      this.updateRedisLatestPosition(driverId, tenantId, enriched),
      this.updateDriverPositionSnapshot(driverId, tenantId, enriched),
      this.publishEnrichedToKafka(enriched),
    ]);

    // Report fan-out failures with destination names
    const destinations = ['Redis', 'PostgreSQL', 'Kafka'];
    const failures = fanOutResults
      .map((r, i) => (r.status === 'rejected' ? destinations[i] : null))
      .filter(Boolean);

    if (failures.length > 0) {
      this.logger.error(
        `Fan-out partial failure for driver ${driverName} (${driverId}): ` +
          `${failures.join(', ')} failed out of ${destinations.length} destinations`,
      );
    }

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

      // Track active drivers per tenant (score = last-seen ms) so the gateway
      // lists them with a scoped ZRANGEBYSCORE instead of a blocking KEYS scan.
      await this.redis.zadd(
        `${REDIS_ACTIVE_SET_PREFIX}${tenantId}`,
        Date.now(),
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
  }

  // ── TimescaleDB historical write ─────────────────────────

  private toTimescaleRow(enriched: EnrichedPosition): EnrichedPositionRow {
    return {
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
  }

  /** Push a row to the batch buffer; flush early when it gets large. */
  private bufferForTimescale(enriched: EnrichedPosition): void {
    this.timescaleBuffer.push(this.toTimescaleRow(enriched));
    if (this.timescaleBuffer.length >= TIMESCALE_FLUSH_THRESHOLD) {
      void this.flushTimescale();
    }
  }

  /** Write and clear the buffered rows in one transaction. */
  private async flushTimescale(): Promise<void> {
    if (this.timescaleBuffer.length === 0) return;
    const batch = this.timescaleBuffer;
    this.timescaleBuffer = [];
    try {
      await this.timescale.insertEnrichedPositionBatch(batch);
    } catch (err) {
      this.logger.error(
        `TimescaleDB batch flush failed (${batch.length} rows dropped)`,
        err,
      );
    }
  }

  // ── Kafka enriched topic ──────────────────────────────────

  private async publishEnrichedToKafka(enriched: EnrichedPosition): Promise<void> {
    await this.kafkaProducer.produce('gps.positions.enriched', {
      key: enriched.driverId,
      value: JSON.stringify(enriched),
      headers: { tenantId: enriched.tenantId },
    });
  }

  // ── Driver status management ─────────────────────────────

  private async ensureDriverActive(driverId: string): Promise<void> {
    // Skip the write once we've marked this driver active this process; the set
    // is periodically cleared so external status changes re-assert.
    if (this.activeDrivers.has(driverId)) return;
    try {
      await this.driverRepo.update(driverId, { status: 'active' });
      this.activeDrivers.add(driverId);
    } catch {
      // Non-critical
    }
  }
}
