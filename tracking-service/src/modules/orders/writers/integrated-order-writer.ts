import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { KafkaProducerService } from '../../kafka/kafka-producer.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderDto } from '../dto/update-order.dto';
import { OrderWriter, OrderWriteResult, OrderStatusMeta } from '../order-writer.interface';

const TOPIC = 'commands.orders';

/**
 * Integrated (MySQL/CDC) order writer: emits commands on `commands.orders` which
 * the integration-service applies to MySQL; Debezium CDC reflects the change back
 * into orders_cache (~2s). All writes are async and return a correlationId.
 * Mirrors the customers Kafka write path.
 */
@Injectable()
export class IntegratedOrderWriter implements OrderWriter {
  private readonly logger = new Logger(IntegratedOrderWriter.name);

  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  async createOrder(tenantId: string, dto: CreateOrderDto): Promise<OrderWriteResult> {
    const correlationId = randomUUID();
    await this.produce('create', correlationId, tenantId, {
      tenantId,
      customerId: dto.customerId,
      orderNumber: dto.orderNumber,
      status: dto.status,
      totalAmount: dto.totalAmount,
      deliveryDate: dto.deliveryDate,
      notes: dto.notes,
    });
    this.logger.log(`order create command sent (tenant=${tenantId}, correlationId=${correlationId})`);
    return { mode: 'async', correlationId };
  }

  async updateOrder(
    tenantId: string,
    id: number,
    dto: UpdateOrderDto,
  ): Promise<OrderWriteResult> {
    const correlationId = randomUUID();
    await this.produce('update', correlationId, tenantId, {
      id,
      tenantId,
      customerId: dto.customerId,
      orderNumber: dto.orderNumber,
      status: dto.status,
      totalAmount: dto.totalAmount,
      deliveryDate: dto.deliveryDate,
      notes: dto.notes,
    });
    this.logger.log(
      `order update command sent (tenant=${tenantId}, id=${id}, correlationId=${correlationId})`,
    );
    return { mode: 'async', correlationId };
  }

  async setOrderStatus(
    tenantId: string,
    orderId: number,
    status: string,
    meta?: OrderStatusMeta,
  ): Promise<void> {
    const correlationId = randomUUID();
    await this.produce('status', correlationId, tenantId, {
      tenantId,
      orderId,
      status,
      completedAt: meta?.completedAt ?? null,
      driverId: meta?.driverId ?? null,
      visitId: meta?.visitId ?? null,
    });
    this.logger.log(
      `order status command sent (tenant=${tenantId}, order=${orderId}, status=${status}, correlationId=${correlationId})`,
    );
  }

  private async produce(
    op: string,
    correlationId: string,
    tenantId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.kafkaProducer.produce(TOPIC, {
      key: tenantId,
      value: JSON.stringify({ op, correlationId, data }),
      headers: { tenantId },
    });
  }
}
