import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { OrderWriter } from './order-writer.interface';
import { StandaloneOrderWriter } from './writers/standalone-order-writer';
import { IntegratedOrderWriter } from './writers/integrated-order-writer';

export interface ResolvedOrderWriter {
  writer: OrderWriter;
  ingestMode: 'standalone' | 'integrated';
  allowAppOrderCreate: boolean;
}

/**
 * Picks the order write strategy for a tenant at request time from its
 * tenant_settings.ingest_mode. No global env flag — mode is per tenant.
 */
@Injectable()
export class OrderWriterResolver {
  constructor(
    private readonly settings: SettingsService,
    private readonly standalone: StandaloneOrderWriter,
    private readonly integrated: IntegratedOrderWriter,
  ) {}

  async resolve(tenantId: string): Promise<ResolvedOrderWriter> {
    const { ingestMode, allowAppOrderCreate } = await this.settings.getOrderMode(tenantId);
    const writer = ingestMode === 'integrated' ? this.integrated : this.standalone;
    return { writer, ingestMode, allowAppOrderCreate };
  }
}
