import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CachedOrder } from '../sync/entities/cached-order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderWriterResolver } from './order-writer.resolver';
import { OrderWriteResult, OrderStatusMeta } from './order-writer.interface';

/**
 * Reads are mode-agnostic (always from orders_cache). Writes resolve the
 * per-tenant strategy and enforce the create/update gate before delegating.
 */
@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(CachedOrder, 'cacheDb')
    private readonly repo: Repository<CachedOrder>,
    private readonly resolver: OrderWriterResolver,
  ) {}

  getAllByTenant(tenantId: string): Promise<CachedOrder[]> {
    return this.repo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(tenantId: string, id: number): Promise<CachedOrder> {
    const order = await this.repo.findOne({ where: { id, tenantId } });
    if (!order) {
      throw new NotFoundException({ errorCode: 'orders.notFound', args: { id } });
    }
    return order;
  }

  async create(tenantId: string, dto: CreateOrderDto): Promise<OrderWriteResult> {
    const { writer, ingestMode, allowAppOrderCreate } = await this.resolver.resolve(tenantId);
    this.assertCreateAllowed(ingestMode, allowAppOrderCreate);
    return writer.createOrder(tenantId, dto);
  }

  async update(tenantId: string, id: number, dto: UpdateOrderDto): Promise<OrderWriteResult> {
    const { writer, ingestMode, allowAppOrderCreate } = await this.resolver.resolve(tenantId);
    this.assertCreateAllowed(ingestMode, allowAppOrderCreate);
    return writer.updateOrder(tenantId, id, dto);
  }

  /**
   * Set an order's status (used by visit completion). Never gated — a status
   * write-back is integration, not origination, so it is always permitted.
   */
  async setOrderStatus(
    tenantId: string,
    orderId: number,
    status: string,
    meta?: OrderStatusMeta,
  ): Promise<void> {
    const { writer } = await this.resolver.resolve(tenantId);
    await writer.setOrderStatus(tenantId, orderId, status, meta);
  }

  private assertCreateAllowed(ingestMode: string, allowAppOrderCreate: boolean): void {
    if (ingestMode === 'integrated' && !allowAppOrderCreate) {
      throw new ForbiddenException({ errorCode: 'orders.appCreateDisabled' });
    }
  }
}
