import { CachedOrder } from '../sync/entities/cached-order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

/**
 * Write result is mode-shaped: standalone writes are synchronous and return the
 * row (HTTP 201); integrated writes are async Kafka commands and return only a
 * correlationId (HTTP 202, the row appears later via CDC).
 */
export type OrderWriteResult =
  | { mode: 'sync'; order: CachedOrder }
  | { mode: 'async'; correlationId: string };

export interface OrderStatusMeta {
  completedAt?: Date | string | null;
  driverId?: string | null;
  visitId?: string | null;
}

/**
 * Strategy for writing orders. Resolved per tenant at request time by
 * OrderWriterResolver (StandaloneOrderWriter | IntegratedOrderWriter).
 */
export interface OrderWriter {
  createOrder(tenantId: string, dto: CreateOrderDto): Promise<OrderWriteResult>;
  updateOrder(tenantId: string, id: number, dto: UpdateOrderDto): Promise<OrderWriteResult>;
  setOrderStatus(
    tenantId: string,
    orderId: number,
    status: string,
    meta?: OrderStatusMeta,
  ): Promise<void>;
}
