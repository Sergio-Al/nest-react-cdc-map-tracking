import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import {
  CachedCustomer,
  CachedAccount,
  CachedProduct,
  SyncState,
  CachedUser,
} from './entities';
import { CdcMetricsService } from './cdc-metrics.service';

/**
 * CDC Consumer – listens to Debezium Kafka topics and syncs
 * MySQL source-of-truth data into the local PostgreSQL cache.
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
    mapFn: (data: Record<string, any>) => Record<string, any>;
  }>;

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly cdcMetrics: CdcMetricsService,

    @InjectRepository(CachedAccount, 'cacheDb')
    private readonly accountRepo: Repository<CachedAccount>,

    @InjectRepository(CachedCustomer, 'cacheDb')
    private readonly customerRepo: Repository<CachedCustomer>,

    @InjectRepository(CachedProduct, 'cacheDb')
    private readonly productRepo: Repository<CachedProduct>,

    @InjectRepository(CachedUser, 'cacheDb')
    private readonly userRepo: Repository<CachedUser>,

    @InjectRepository(SyncState, 'cacheDb')
    private readonly syncStateRepo: Repository<SyncState>,
  ) {
    this.topicEntityMap = {
      'cdc.accounts': {
        repo: this.accountRepo,
        tableName: 'accounts_cache',
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
        mapFn: (d) => ({
          id: d.id,
          tenantId: d.tenant_id,
          name: d.name,
          phone: d.phone ?? null,
          email: d.email ?? null,
          address: d.address ?? null,
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
      'cdc.users': {
        repo: this.userRepo,
        tableName: 'cached_users',
        mapFn: (d: Record<string, any>) => ({
          id: d.id,
          tenantId: d.tenant_id,
          email: d.email,
          password: d.password,
          name: d.name,
          role: d.role,
          driverId: d.driver_id ?? null,
          isActive: d.is_active === 1 || d.is_active === true,
        }),
      },
    };
  }

  onModuleInit() {
    // Register handlers for each CDC topic
    for (const topic of Object.keys(this.topicEntityMap)) {
      this.kafkaConsumer.registerHandler({
        topic,
        fromBeginning: true, // Consume initial Debezium snapshot
        handler: async (payload) => {
          const value = payload.message.value?.toString();
          if (!value) return;

          try {
            const data = JSON.parse(value);
            await this.processCdcMessage(
              topic,
              data,
              payload.message.offset,
              payload.message.timestamp,
            );
          } catch (error) {
            this.cdcMetrics.recordError(topic, error.message || String(error));
            this.logger.error(
              `Failed to process CDC message from ${topic} offset ${payload.message.offset}`,
              error,
            );
          }
        },
      });
      this.logger.log(`Registered CDC handler for topic: ${topic}`);
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

    const { repo, tableName, mapFn } = mapping;
    const op = data.__op || 'c'; // c=create, u=update, d=delete, r=read (snapshot)
    const isDelete = data.__deleted === 'true' || op === 'd';

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

    // Record metrics
    this.cdcMetrics.recordEvent(
      topic,
      data.__source_ts_ms ? Number(data.__source_ts_ms) : null,
      kafkaTimestamp ? Number(kafkaTimestamp) : null,
      op,
    );
  }
}
