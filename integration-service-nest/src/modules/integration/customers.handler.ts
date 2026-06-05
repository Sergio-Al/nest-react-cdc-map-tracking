import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EachMessagePayload } from 'kafkajs';
import { CustomerEntity } from './entities/customer.entity';
import { CommandMessage, CustomerData, PermanentCommandError } from './command.types';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { DlqService } from '../kafka/dlq.service';
import { MetricsService } from '../metrics/metrics.service';

const TOPIC = 'commands.customers';
const MAX_RETRIES = 3; // 4 attempts total, matching the Go handler

/**
 * Port of `internal/consumer/customers.go`. Consumes `commands.customers`,
 * INSERTs into MySQL `customers` (id is AUTO_INCREMENT), retries DB failures
 * with exponential backoff (300ms base), and DLQs on parse/op/exhaustion.
 */
@Injectable()
export class CustomersHandler implements OnModuleInit {
  private readonly logger = new Logger(CustomersHandler.name);

  constructor(
    @InjectRepository(CustomerEntity)
    private readonly repo: Repository<CustomerEntity>,
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
    let data: CustomerData;
    try {
      cmd = this.parseEnvelope(raw);
      if (cmd.op !== 'create') {
        throw new PermanentCommandError(`unhandled op: ${cmd.op}`);
      }
      data = this.parseData(cmd);
    } catch (err) {
      const reason =
        err instanceof PermanentCommandError
          ? err.message
          : `invalid JSON: ${(err as Error).message}`;
      this.logger.error(`${TOPIC}: ${reason} (offset=${message.offset})`);
      await this.dlq.sendToDlq(TOPIC, message.key, raw, reason);
      return;
    }

    const geofence = data.geofenceRadiusMeters ?? 100;
    const customerType = data.customerType ?? 'regular';

    let lastErr: Error | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await this.sleep(300 * Math.pow(2, attempt - 1));
      }
      try {
        await this.repo.insert({
          tenantId: data.tenantId,
          name: data.name,
          phone: data.phone ?? null,
          email: data.email ?? null,
          address: data.address ?? null,
          zone: data.zone ?? null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          geofenceRadiusMeters: geofence,
          customerType,
        });
        this.logger.log(
          `customer created in MySQL (correlationId=${cmd.correlationId}, tenant=${data.tenantId}, name=${data.name})`,
        );
        return;
      } catch (err) {
        lastErr = err as Error;
        this.metrics.addDbError();
        this.logger.warn(
          `DB insert failed, retrying (attempt ${attempt + 1}, correlationId=${cmd.correlationId}): ${lastErr.message}`,
        );
      }
    }

    const reason = `DB error after retries: ${lastErr?.message}`;
    this.logger.error(`${TOPIC}: ${reason} (correlationId=${cmd.correlationId})`);
    await this.dlq.sendToDlq(TOPIC, message.key, raw, reason);
  }

  private parseEnvelope(raw: Buffer | null): CommandMessage {
    if (!raw) throw new Error('empty message value');
    return JSON.parse(raw.toString()) as CommandMessage;
  }

  private parseData(cmd: CommandMessage): CustomerData {
    const data = cmd.data as CustomerData;
    if (!data || typeof data !== 'object') {
      throw new PermanentCommandError('invalid data: not an object');
    }
    if (!data.tenantId || !data.name) {
      throw new PermanentCommandError('invalid data: tenantId and name are required');
    }
    return data;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
