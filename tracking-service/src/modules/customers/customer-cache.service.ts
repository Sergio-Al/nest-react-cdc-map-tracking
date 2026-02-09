import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { CachedCustomer } from '../sync/entities';

const MEMORY_TTL_MS = 60_000; // 60 seconds
const REDIS_TTL_SEC = 300;   // 5 minutes
const REDIS_PREFIX = 'cache:customer:';

interface MemoryCacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class CustomerCacheService {
  private readonly logger = new Logger(CustomerCacheService.name);
  private readonly memoryCache = new Map<string, MemoryCacheEntry<CachedCustomer>>();

  constructor(
    @InjectRepository(CachedCustomer, 'cacheDb')
    private readonly customerRepo: Repository<CachedCustomer>,
    private readonly redis: RedisService,
  ) {}

  /**
   * Three-level cache lookup: Memory → Redis → PostgreSQL
   */
  async getById(id: number): Promise<CachedCustomer | null> {
    const key = String(id);

    // ── Level 1: In-memory Map ──────────────────────────
    const memEntry = this.memoryCache.get(key);
    if (memEntry && memEntry.expiresAt > Date.now()) {
      return memEntry.data;
    }
    this.memoryCache.delete(key);

    // ── Level 2: Redis ──────────────────────────────────
    const cached = await this.redis.getJson<CachedCustomer>(REDIS_PREFIX + key);
    if (cached) {
      this.setMemory(key, cached);
      return cached;
    }

    // ── Level 3: Local PostgreSQL (always fresh via CDC) ─
    const dbRecord = await this.customerRepo.findOne({ where: { id } });
    if (dbRecord) {
      await this.setRedis(key, dbRecord);
      this.setMemory(key, dbRecord);
      return dbRecord;
    }

    return null;
  }

  /**
   * Get customer by tenant + id
   */
  async getByTenantAndId(tenantId: string, id: number): Promise<CachedCustomer | null> {
    const customer = await this.getById(id);
    if (customer && customer.tenantId === tenantId) {
      return customer;
    }
    return null;
  }

  /**
   * Get all customers for a tenant
   */
  async getAllByTenant(tenantId: string): Promise<CachedCustomer[]> {
    return this.customerRepo.find({ where: { tenantId } });
  }

  /**
   * Get active customers with coordinates for a tenant (for geofence matching)
   */
  async getGeoCustomers(tenantId: string): Promise<CachedCustomer[]> {
    return this.customerRepo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.active = true')
      .andWhere('c.latitude IS NOT NULL')
      .andWhere('c.longitude IS NOT NULL')
      .getMany();
  }

  /**
   * Invalidate cache for a customer (called by CDC consumer when data changes)
   */
  async invalidate(id: number): Promise<void> {
    const key = String(id);
    this.memoryCache.delete(key);
    await this.redis.del(REDIS_PREFIX + key);
    this.logger.debug(`Invalidated cache for customer ${id}`);
  }

  /**
   * Warm cache for a tenant — pre-load all customers into Redis + memory
   */
  async warmCacheForTenant(tenantId: string): Promise<number> {
    const customers = await this.customerRepo.find({ where: { tenantId } });
    for (const c of customers) {
      const key = String(c.id);
      await this.setRedis(key, c);
      this.setMemory(key, c);
    }
    this.logger.log(`Warmed cache for tenant ${tenantId}: ${customers.length} customers`);
    return customers.length;
  }

  // ── Private helpers ────────────────────────────────────────

  private setMemory(key: string, data: CachedCustomer): void {
    this.memoryCache.set(key, {
      data,
      expiresAt: Date.now() + MEMORY_TTL_MS,
    });
  }

  private async setRedis(key: string, data: CachedCustomer): Promise<void> {
    await this.redis.setJson(REDIS_PREFIX + key, data, REDIS_TTL_SEC);
  }
}
