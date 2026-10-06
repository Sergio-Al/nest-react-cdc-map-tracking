import { PipelineTraceService } from '../pipeline/pipeline-trace.service';
import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import {
  CachedCustomer,
  CachedAccount,
  CachedProduct,
  CachedOrder,
  SyncState,
} from './entities';
import { CdcMetricsService } from './cdc-metrics.service';
import { CustomerCacheService } from '../customers/customer-cache.service';
import { TrackingGateway } from '../websocket/tracking.gateway';
import { CdcChangeEvent, buildCdcChangeEvent } from '../websocket/ws.types';

/**
 * CDC Consumer – listens to Debezium Kafka topics and syncs
 * MySQL source-of-truth data into the local PostgreSQL cache.
 *
 * NOTE: `drivers` was cut out of this loop — drivers are now
 * PostgreSQL-owned and written directly by DriversService, which also
 * keeps the enrichment device→driver map current. Do not re-add a
 * `cdc.drivers` entry here.
 *
 * Debezium messages (with ExtractNewRecordState transform) look like:
 *   - INSERT/UPDATE: { "id": 1, "name": "Acme", ..., "__op": "c|u", "__table": "accounts", "__source_ts_ms": ... }
 *   - DELETE:        { "id": 1, ..., "__deleted": "true", "__op": "d" }
 */
@Injectable()
export class CdcConsumerService implements OnModuleInit {
  private readonly logger = new Logger(CdcConsumerService.name);

  private readonly topicEntityMap: Record<string, {
    repo: Repository<any>;
    tableName: string;
    table: CdcChangeEvent['table'];
    mapFn: (data: Record<string, any>) => Record<string, any>;
  }>;

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly cdcMetrics: CdcMetricsService,
    private readonly customerCache: CustomerCacheService,
    private readonly traces: PipelineTraceService,
    @Inject(forwardRef(() => TrackingGateway))
    private readonly trackingGateway: TrackingGateway,

    @InjectRepository(CachedAccount, 'cacheDb')
    private readonly accountRepo: Repository<CachedAccount>,

    @InjectRepository(CachedCustomer, 'cacheDb')
    private readonly customerRepo: Repository<CachedCustomer>,

    @InjectRepository(CachedProduct, 'cacheDb')
    private readonly productRepo: Repository<CachedProduct>,

    @InjectRepository(CachedOrder, 'cacheDb')
    private readonly orderRepo: Repository<CachedOrder>,

    @InjectRepository(SyncState, 'cacheDb')
    private readonly syncStateRepo: Repository<SyncState>,
  ) {
    this.topicEntityMap = {
      'cdc.accounts': {
        repo: this.accountRepo,
        tableName: 'accounts_cache',
        table: 'accounts',
        mapFn: (d) => ({
          id: d.id,
          tenantId: d.tenant_id,
          name: d.name,
          accountType: d.account_type ?? 'standard',
          settings: d.settings ? (typeof d.settings === 'string' ? JSON.parse(d.settings) : d.settings) : null,
          syncedAt: new Date(),
        }),
      },
      'cdc.customers': {
        repo: this.customerRepo,
        tableName: 'customers_cache',
        table: 'customers',
        mapFn: (d) => ({
          id: d.id,
          tenantId: d.tenant_id,
          name: d.name,
          phone: d.phone ?? null,
          email: d.email ?? null,
          address: d.address ?? null,
          zone: d.zone ?? null,
          latitude: d.latitude ?? null,
          longitude: d.longitude ?? null,
          geofenceRadiusMeters: d.geofence_radius_meters ?? 100,
          customerType: d.customer_type ?? 'regular',
          active: d.active === 1 || d.active === true,
          syncedAt: new Date(),
        }),
      },
      'cdc.products': {
        repo: this.productRepo,
        tableName: 'products_cache',
        table: 'products',
        mapFn: (d) => ({
          id: d.id,
          tenantId: d.tenant_id,
          name: d.name,
          sku: d.sku,
          category: d.category ?? null,
          unitPrice: d.unit_price ?? 0,
          active: d.active === 1 || d.active === true,
          syncedAt: new Date(),
        }),
      },
      'cdc.orders': {
        repo: this.orderRepo,
        tableName: 'orders_cache',
        table: 'orders',
        mapFn: (d) => ({
          id: d.id,
          tenantId: d.tenant_id,
          customerId: d.customer_id,
          orderNumber: d.order_number,
          status: d.status ?? 'pending',
          totalAmount: d.total_amount ?? 0,
          // Debezium (time.precision.mode=connect, schemaless JSON) encodes a
          // DATE as an integer day-count since epoch; normalize to YYYY-MM-DD.
          deliveryDate: this.normalizeCdcDate(d.delivery_date),
          notes: d.notes ?? null,
          syncedAt: new Date(),
        }),
      },
    };
  }

  onModuleInit() {
    // Register handlers for each CDC topic (with retry + DLQ)
    for (const topic of Object.keys(this.topicEntityMap)) {
      this.kafkaConsumer.registerHandler({
        topic,
        fromBeginning: true, // Consume initial Debezium snapshot
        retryPolicy: { maxRetries: 3, baseDelayMs: 200 },
        handler: async (payload) => {
          const value = payload.message.value?.toString();
          if (!value) return;

          // Parse and process — errors propagate to the consumer's retry/DLQ logic
          const data = JSON.parse(value);
          await this.processCdcMessage(
            topic,
            data,
            payload.message.offset,
            payload.message.timestamp,
          );
        },
      });
      this.logger.log(`Registered CDC handler for topic: ${topic}`);
    }
  }

  /**
   * Debezium (time.precision.mode=connect) sends a SQL DATE as an integer count
   * of days since the Unix epoch under schemaless JSON. Convert that to a
   * 'YYYY-MM-DD' string; pass through strings/nulls unchanged.
   */
  private normalizeCdcDate(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      return new Date(value * 86_400_000).toISOString().slice(0, 10);
    }
    return String(value).slice(0, 10);
  }

  /**
   * Side effects once the read model is updated. Best-effort: the PG write
   * already succeeded, so a failure here must not fail the message (that would
   * retry → DLQ an already-applied change).
   *  - customers: drop the in-process + Redis entries so geofencing / ETA /
   *    route optimization see moved coordinates or a new radius immediately
   *    instead of after the 5-min Redis TTL.
   *  - notify the owning tenant (`cdc:change`) so dashboards refetch — this is a
   *    change made in the tenant's own system. Snapshot reads ('r') are skipped
   *    so a (re)start doesn't flood clients.
   */
  private async afterApplied(
    table: CdcChangeEvent['table'],
    op: string,
    data: Record<string, any>,
    isDelete: boolean,
    appliedAt: number,
  ): Promise<boolean> {
    const id = Number(data.id);
    if (!Number.isFinite(id)) return false;
    try {
      if (table === 'customers') await this.customerCache.invalidate(id);
    } catch (err) {
      this.logger.warn(`Customer cache invalidation failed for id=${id}: ${(err as Error).message}`);
    }
    if (op === 'r' || !data.tenant_id) return false;
    try {
      const sourceTsMs = data.__source_ts_ms ? Number(data.__source_ts_ms) : null;
      this.trackingGateway.broadcastCdcChange(buildCdcChangeEvent(
        table,
        isDelete ? 'd' : op === 'u' ? 'u' : 'c',
        id,
        String(data.tenant_id),
        sourceTsMs,
        appliedAt,
      ));
      return true;
    } catch (err) {
      this.logger.warn(`cdc:change broadcast failed for ${table}#${id}: ${(err as Error).message}`);
      return false;
    }
  }

  private async processCdcMessage(
    topic: string,
    data: Record<string, any>,
    offset: string,
    kafkaTimestamp: string,
  ): Promise<void> {
    const mapping = this.topicEntityMap[topic];
    if (!mapping) return;

    const { repo, tableName, table, mapFn } = mapping;
    const op = data.__op || 'c'; // c=create, u=update, d=delete, r=read (snapshot)
    const isDelete = data.__deleted === 'true' || op === 'd';

    const traceable = (table === 'customers' || table === 'orders') && (op === 'c' || op === 'u') && !isDelete;
    const correlationId = traceable ? await this.traces.lookupLink(table, Number(data.id)) : null;

    if (isDelete) {
      // DELETE
      const id = data.id;
      if (id) {
        await repo.delete({ id });
        this.logger.debug(`[${tableName}] DELETED id=${id}`);
      }
    } else {
      // UPSERT (INSERT or UPDATE)
      const entity = mapFn(data);
      await repo.upsert(entity, ['id']);
      this.logger.debug(`[${tableName}] UPSERTED id=${entity.id} (op=${op})`);
    }
    // Read model is now visible — this is the "applied" moment for latency.
    const appliedAt = Date.now();

    // Update sync state
    await this.syncStateRepo.upsert(
      {
        tableName,
        lastOffset: offset,
        lastSyncedAt: new Date(),
        status: 'synced',
      },
      ['tableName'],
    );

    const broadcast = await this.afterApplied(table, op, data, isDelete, appliedAt);
    if (traceable && data.tenant_id) {
      await this.traces.finishCdc({
        table: table as 'customers' | 'orders', id: Number(data.id), tenantId: String(data.tenant_id),
        capturedAt: new Date(Number.isFinite(Number(kafkaTimestamp)) ? Number(kafkaTimestamp) : appliedAt).toISOString(),
        sourceTsMs: data.__source_ts_ms ? Number(data.__source_ts_ms) : null,
        appliedAt: new Date(appliedAt).toISOString(),
        broadcastAt: broadcast ? new Date().toISOString() : null,
      }, correlationId);
    }

    // Record metrics
    this.cdcMetrics.recordEvent(
      topic,
      data.__source_ts_ms ? Number(data.__source_ts_ms) : null,
      kafkaTimestamp ? Number(kafkaTimestamp) : null,
      op,
    );
  }
}
