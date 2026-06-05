import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EachMessagePayload } from 'kafkajs';
import { DriverEntity } from './entities/driver.entity';
import { CommandMessage, DriverData, PermanentCommandError } from './command.types';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { DlqService } from '../kafka/dlq.service';
import { MetricsService } from '../metrics/metrics.service';

const TOPIC = 'commands.drivers';
const MAX_RETRIES = 3; // 4 attempts total, matching the Go handler

/**
 * Port of `internal/consumer/drivers.go`. Consumes `commands.drivers`, INSERTs
 * into MySQL `drivers` (id is the client-supplied CHAR(36) UUID), retries DB
 * failures with exponential backoff (300ms base), and DLQs on parse/op/exhaustion.
 *
 * DORMANT: drivers are now PostgreSQL-owned and written directly by
 * tracking-service, so `commands.drivers` is no longer produced and this handler
 * sits idle. It is intentionally kept (still self-registers) as the re-enable
 * path for a future GATED MySQL→PG driver inbound-sync. Do not delete.
 */
@Injectable()
export class DriversHandler implements OnModuleInit {
  private readonly logger = new Logger(DriversHandler.name);

  constructor(
    @InjectRepository(DriverEntity)
    private readonly repo: Repository<DriverEntity>,
    private readonly consumer: KafkaConsumerService,
    private readonly dlq: DlqService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit() {
    // DORMANT (see class doc): subscribes to an idle topic until the gated
    // inbound-sync ships. Harmless — no commands.drivers are produced now.
    this.consumer.registerHandler({
      topic: TOPIC,
      handler: (payload) => this.handle(payload),
    });
  }

  private async handle(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    const raw = message.value;

    let cmd: CommandMessage;
    let data: DriverData;
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

    const vehicleType = data.vehicleType ?? 'van';
    const status = data.status ?? 'offline';

    let lastErr: Error | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await this.sleep(300 * Math.pow(2, attempt - 1));
      }
      try {
        await this.repo.insert({
          id: data.id,
          tenantId: data.tenantId,
          name: data.name,
          deviceId: data.deviceId ?? null,
          phone: data.phone ?? null,
          vehiclePlate: data.vehiclePlate ?? null,
          vehicleType,
          status,
        });
        this.logger.log(
          `driver created in MySQL (correlationId=${cmd.correlationId}, tenant=${data.tenantId}, name=${data.name}, driverId=${data.id})`,
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

  private parseData(cmd: CommandMessage): DriverData {
    const data = cmd.data as DriverData;
    if (!data || typeof data !== 'object') {
      throw new PermanentCommandError('invalid data: not an object');
    }
    if (!data.id || !data.tenantId || !data.name) {
      throw new PermanentCommandError('invalid data: id, tenantId and name are required');
    }
    return data;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
