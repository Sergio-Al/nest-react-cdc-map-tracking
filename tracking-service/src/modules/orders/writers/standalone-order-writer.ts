import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CachedOrder } from '../../sync/entities/cached-order.entity';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderDto } from '../dto/update-order.dto';
import { OrderWriter, OrderWriteResult } from '../order-writer.interface';

/**
 * Standalone (PG-owned) order writer: `orders_cache` is the source of truth.
 * Writes go straight to PostgreSQL, synchronously — no MySQL, Kafka or CDC.
 * Mirrors how drivers/vehicles/visits are written.
 */
@Injectable()
export class StandaloneOrderWriter implements OrderWriter {
  private readonly logger = new Logger(StandaloneOrderWriter.name);

  constructor(
    @InjectRepository(CachedOrder, 'cacheDb')
    private readonly repo: Repository<CachedOrder>,
  ) {}

  async createOrder(tenantId: string, dto: CreateOrderDto): Promise<OrderWriteResult> {
    const orderNumber = dto.orderNumber ?? (await this.nextOrderNumber());
    // id is assigned by the orders_cache_id_seq DB default; omit it so the
    // sequence fires, and use RETURNING to read it back.
    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(CachedOrder)
      .values({
        tenantId,
        customerId: dto.customerId,
        orderNumber,
        status: dto.status ?? 'pending',
        totalAmount: dto.totalAmount ?? 0,
        deliveryDate: dto.deliveryDate ?? null,
        notes: dto.notes ?? null,
      })
      .returning('id')
      .execute();

    const id = result.raw?.[0]?.id as number;
    const order = await this.repo.findOneByOrFail({ id });
    this.logger.log(
      `order created in PG (tenant=${tenantId}, id=${id}, number=${orderNumber})`,
    );
    return { mode: 'sync', order };
  }

  async updateOrder(
    tenantId: string,
    id: number,
    dto: UpdateOrderDto,
  ): Promise<OrderWriteResult> {
    const fields = this.buildUpdateFields(dto);
    fields.updatedAt = new Date();
    const res = await this.repo.update({ id, tenantId }, fields);
    if (!res.affected) {
      throw new NotFoundException({ errorCode: 'orders.notFound', args: { id } });
    }
    const order = await this.repo.findOneByOrFail({ id, tenantId });
    this.logger.log(`order updated in PG (tenant=${tenantId}, id=${id})`);
    return { mode: 'sync', order };
  }

  async setOrderStatus(
    tenantId: string,
    orderId: number,
    status: string,
  ): Promise<void> {
    const res = await this.repo.update(
      { id: orderId, tenantId },
      { status, updatedAt: new Date() },
    );
    if (!res.affected) {
      this.logger.warn(
        `setOrderStatus: order not found (tenant=${tenantId}, id=${orderId}) — skipping`,
      );
      return;
    }
    this.logger.log(`order status set in PG (tenant=${tenantId}, id=${orderId}, status=${status})`);
  }

  private async nextOrderNumber(): Promise<string> {
    const rows = (await this.repo.query("SELECT nextval('orders_number_seq') AS n")) as Array<{
      n: string;
    }>;
    const n = Number(rows[0]?.n ?? 0);
    return `ORD-${String(n).padStart(6, '0')}`;
  }

  private buildUpdateFields(dto: UpdateOrderDto): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    if (dto.customerId !== undefined) fields.customerId = dto.customerId;
    if (dto.orderNumber !== undefined) fields.orderNumber = dto.orderNumber;
    if (dto.status !== undefined) fields.status = dto.status;
    if (dto.totalAmount !== undefined) fields.totalAmount = dto.totalAmount;
    if (dto.deliveryDate !== undefined) fields.deliveryDate = dto.deliveryDate;
    if (dto.notes !== undefined) fields.notes = dto.notes;
    return fields;
  }
}
