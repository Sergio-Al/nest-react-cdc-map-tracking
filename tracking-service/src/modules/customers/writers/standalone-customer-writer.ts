import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CachedCustomer } from '../../sync/entities/cached-customer.entity';
import { CustomerCacheService } from '../customer-cache.service';
import { TrackingGateway } from '../../websocket/tracking.gateway';
import { buildCdcChangeEvent } from '../../websocket/ws.types';
import { CustomerWriter, CustomerWriteResult } from '../customer-writer.interface';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';

@Injectable()
export class StandaloneCustomerWriter implements CustomerWriter {
  private readonly logger = new Logger(StandaloneCustomerWriter.name);

  constructor(
    @InjectRepository(CachedCustomer, 'cacheDb')
    private readonly repo: Repository<CachedCustomer>,
    private readonly cache: CustomerCacheService,
    private readonly gateway: TrackingGateway,
  ) {}

  async createCustomer(tenantId: string, dto: CreateCustomerDto): Promise<CustomerWriteResult> {
    // Omit id: PostgreSQL assigns it from the standalone-only sequence range.
    const result = await this.repo.createQueryBuilder()
      .insert()
      .into(CachedCustomer)
      .values({
        tenantId,
        name: dto.name,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        address: dto.address ?? null,
        zone: dto.zone ?? null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        geofenceRadiusMeters: dto.geofenceRadiusMeters ?? 100,
        customerType: dto.customerType ?? 'regular',
        active: true,
      })
      .returning('id')
      .execute();
    const id = Number(result.raw[0].id);
    const customer = await this.repo.findOneByOrFail({ id, tenantId });
    await this.afterWrite(customer, 'c');
    return { mode: 'sync', customer };
  }

  async updateCustomer(tenantId: string, id: number, dto: UpdateCustomerDto): Promise<CustomerWriteResult> {
    const fields: Partial<CachedCustomer> = { syncedAt: new Date() };
    const editable = [
      'name', 'phone', 'email', 'address', 'zone', 'latitude', 'longitude',
      'geofenceRadiusMeters', 'customerType',
    ] as const;
    for (const key of editable) {
      if (dto[key] !== undefined) Object.assign(fields, { [key]: dto[key] });
    }
    const result = await this.repo.update({ id, tenantId }, fields);
    if (!result.affected) {
      throw new NotFoundException({ errorCode: 'customers.notFound', args: { id } });
    }
    const customer = await this.repo.findOneByOrFail({ id, tenantId });
    await this.afterWrite(customer, 'u');
    return { mode: 'sync', customer };
  }

  private async afterWrite(customer: CachedCustomer, op: 'c' | 'u'): Promise<void> {
    // The write already succeeded: notification failures must not trigger duplicate creates.
    try {
      await this.cache.invalidate(Number(customer.id));
    } catch (err) {
      this.logger.warn(`Customer cache invalidation failed for id=${customer.id}: ${(err as Error).message}`);
    }
    try {
      this.gateway.broadcastCdcChange(buildCdcChangeEvent(
        'customers', op, Number(customer.id), customer.tenantId, null, Date.now(),
      ));
    } catch (err) {
      this.logger.warn(`Customer change broadcast failed for id=${customer.id}: ${(err as Error).message}`);
    }
  }
}
