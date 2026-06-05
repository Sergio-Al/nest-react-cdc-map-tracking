import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EachMessagePayload } from 'kafkajs';
import { OrderEntity } from './entities/order.entity';
import {
  CommandMessage,
  OrderStatusData,
  OrderWriteData,
  PermanentCommandError,
} from './command.types';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { DlqService } from '../kafka/dlq.service';
import { MetricsService } from '../metrics/metrics.service';

const TOPIC = 'commands.orders';
const MAX_RETRIES = 3; // 4 attempts total, matching the customers handler
const OPS = ['create', 'update', 'status'];

/**
 * Consumes `commands.orders` and writes MySQL `orders` for integrated tenants:
 *   • op:'create' / op:'update' — app-side order management (gated upstream by the
 *     tenant's allow_app_order_create flag); writes round-trip back via CDC.
 *   • op:'status' — the narrow delivery-completion echo (driver finishes a visit →
 *     tracking-service → here → MySQL → Debezium CDC → orders_cache).
 * Same retry + DLQ contract as CustomersHandler: parse/validation/unknown-op and
 * "order not found" are permanent (→ DLQ, no retry); DB errors retry then DLQ.
 */
@Injectable()
export class OrdersHandler implements OnModuleInit {
  private readonly logger = new Logger(OrdersHandler.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly repo: Repository<OrderEntity>,
    private readonly consumer: KafkaConsumerService,
    private readonly dlq: DlqService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit() {
    this.consumer.registerHandler({
      topic: TOPIC,
      handler: (payload) => this.handle(payload),
    });
  }

  private async handle(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    const raw = message.value;

    let cmd: CommandMessage;
    try {
      cmd = this.parseEnvelope(raw);
      if (!OPS.includes(cmd.op)) {
        throw new PermanentCommandError(`unhandled op: ${cmd.op}`);
      }
    } catch (err) {
      const reason =
        err instanceof PermanentCommandError
          ? err.message
          : `invalid JSON: ${(err as Error).message}`;
      this.logger.error(`${TOPIC}: ${reason} (offset=${message.offset})`);
      await this.dlq.sendToDlq(TOPIC, message.key, raw, reason);
      return;
    }

    let lastErr: Error | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await this.sleep(300 * Math.pow(2, attempt - 1));
      }
      try {
        await this.apply(cmd);
        return;
      } catch (err) {
        // Permanent conditions (validation, order-not-found) never benefit from a retry.
        if (err instanceof PermanentCommandError) {
          this.logger.error(`${TOPIC}: ${err.message} (correlationId=${cmd.correlationId})`);
          await this.dlq.sendToDlq(TOPIC, message.key, raw, err.message);
          return;
        }
        lastErr = err as Error;
        this.metrics.addDbError();
        this.logger.warn(
          `DB write failed, retrying (attempt ${attempt + 1}, correlationId=${cmd.correlationId}): ${lastErr.message}`,
        );
      }
    }

    const reason = `DB error after retries: ${lastErr?.message}`;
    this.logger.error(`${TOPIC}: ${reason} (correlationId=${cmd.correlationId})`);
    await this.dlq.sendToDlq(TOPIC, message.key, raw, reason);
  }

  /** Apply one command. Throws PermanentCommandError for non-retryable failures. */
  private async apply(cmd: CommandMessage): Promise<void> {
    if (cmd.op === 'status') return this.applyStatus(cmd);
    if (cmd.op === 'create') return this.applyCreate(cmd);
    return this.applyUpdate(cmd);
  }

  private async applyStatus(cmd: CommandMessage): Promise<void> {
    const data = cmd.data as OrderStatusData;
    if (!data || typeof data !== 'object') {
      throw new PermanentCommandError('invalid data: not an object');
    }
    if (!data.tenantId || data.orderId == null || !data.status) {
      throw new PermanentCommandError('invalid data: tenantId, orderId and status are required');
    }
    const result = await this.repo.update(
      { id: String(data.orderId), tenantId: data.tenantId },
      { status: data.status },
    );
    if (!result.affected) {
      throw new PermanentCommandError(
        `order not found: id=${data.orderId} tenant=${data.tenantId}`,
      );
    }
    this.logger.log(
      `order status updated in MySQL (correlationId=${cmd.correlationId}, tenant=${data.tenantId}, order=${data.orderId}, status=${data.status})`,
    );
  }

  private async applyCreate(cmd: CommandMessage): Promise<void> {
    const data = cmd.data as OrderWriteData;
    if (!data || typeof data !== 'object') {
      throw new PermanentCommandError('invalid data: not an object');
    }
    if (!data.tenantId || data.customerId == null) {
      throw new PermanentCommandError('invalid data: tenantId and customerId are required');
    }
    const orderNumber = data.orderNumber ?? `ORD-${Date.now()}`;
    await this.repo.insert({
      tenantId: data.tenantId,
      customerId: String(data.customerId),
      orderNumber,
      status: data.status ?? 'pending',
      totalAmount: data.totalAmount ?? 0,
      deliveryDate: data.deliveryDate ?? null,
      notes: data.notes ?? null,
    });
    this.logger.log(
      `order created in MySQL (correlationId=${cmd.correlationId}, tenant=${data.tenantId}, number=${orderNumber})`,
    );
  }

  private async applyUpdate(cmd: CommandMessage): Promise<void> {
    const data = cmd.data as OrderWriteData;
    if (!data || typeof data !== 'object') {
      throw new PermanentCommandError('invalid data: not an object');
    }
    if (!data.tenantId || data.id == null) {
      throw new PermanentCommandError('invalid data: tenantId and id are required');
    }
    const result = await this.repo.update(
      { id: String(data.id), tenantId: data.tenantId },
      this.buildUpdateFields(data),
    );
    if (!result.affected) {
      throw new PermanentCommandError(`order not found: id=${data.id} tenant=${data.tenantId}`);
    }
    this.logger.log(
      `order updated in MySQL (correlationId=${cmd.correlationId}, tenant=${data.tenantId}, id=${data.id})`,
    );
  }

  private buildUpdateFields(data: OrderWriteData): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    if (data.customerId !== undefined) fields.customerId = String(data.customerId);
    if (data.orderNumber !== undefined) fields.orderNumber = data.orderNumber;
    if (data.status !== undefined) fields.status = data.status;
    if (data.totalAmount !== undefined) fields.totalAmount = data.totalAmount;
    if (data.deliveryDate !== undefined) fields.deliveryDate = data.deliveryDate;
    if (data.notes !== undefined) fields.notes = data.notes;
    return fields;
  }

  private parseEnvelope(raw: Buffer | null): CommandMessage {
    if (!raw) throw new Error('empty message value');
    return JSON.parse(raw.toString()) as CommandMessage;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
