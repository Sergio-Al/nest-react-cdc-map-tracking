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
      if (cmd.op !== 'create' && cmd.op !== 'update') {
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

    let lastErr: Error | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await this.sleep(300 * Math.pow(2, attempt - 1));
      }
      try {
        if (cmd.op === 'update') {
          const result = await this.repo.update(
            { id: String(data.id), tenantId: data.tenantId },
            this.buildUpdateFields(data),
          );
          // Missing row is permanent — retrying won't help.
          if (!result.affected) {
            const reason = `customer not found: id=${data.id} tenant=${data.tenantId}`;
            this.logger.error(`${TOPIC}: ${reason} (correlationId=${cmd.correlationId})`);
            await this.dlq.sendToDlq(TOPIC, message.key, raw, reason);
            return;
          }
          this.logger.log(
            `customer updated in MySQL (correlationId=${cmd.correlationId}, tenant=${data.tenantId}, id=${data.id})`,
          );
          return;
        }

        await this.repo.insert({
          tenantId: data.tenantId,
          name: data.name,
          phone: data.phone ?? null,
          email: data.email ?? null,
          address: data.address ?? null,
          zone: data.zone ?? null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          geofenceRadiusMeters: data.geofenceRadiusMeters ?? 100,
          customerType: data.customerType ?? 'regular',
        });
        this.logger.log(
          `customer created in MySQL (correlationId=${cmd.correlationId}, tenant=${data.tenantId}, name=${data.name})`,
        );
        return;
      } catch (err) {
        lastErr = err as Error;
        this.metrics.addDbError();
        this.logger.warn(
          `DB ${cmd.op} failed, retrying (attempt ${attempt + 1}, correlationId=${cmd.correlationId}): ${lastErr.message}`,
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
    if (!data.tenantId) {
      throw new PermanentCommandError('invalid data: tenantId is required');
    }
    if (cmd.op === 'update') {
      if (data.id == null) {
        throw new PermanentCommandError('invalid data: id is required for update');
      }
    } else if (!data.name) {
      throw new PermanentCommandError('invalid data: name is required for create');
    }
    return data;
  }

  /** Build a partial UPDATE payload from only the fields present in the command. */
  private buildUpdateFields(data: CustomerData): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    if (data.name !== undefined) fields.name = data.name;
    if (data.phone !== undefined) fields.phone = data.phone;
    if (data.email !== undefined) fields.email = data.email;
    if (data.address !== undefined) fields.address = data.address;
    if (data.zone !== undefined) fields.zone = data.zone;
    if (data.latitude !== undefined) fields.latitude = data.latitude;
    if (data.longitude !== undefined) fields.longitude = data.longitude;
    if (data.geofenceRadiusMeters !== undefined)
      fields.geofenceRadiusMeters = data.geofenceRadiusMeters;
    if (data.customerType !== undefined) fields.customerType = data.customerType;
    return fields;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
