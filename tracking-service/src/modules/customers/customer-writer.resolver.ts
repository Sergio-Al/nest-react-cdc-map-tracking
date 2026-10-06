import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { CustomerWriter } from './customer-writer.interface';
import { StandaloneCustomerWriter } from './writers/standalone-customer-writer';
import { IntegratedCustomerWriter } from './writers/integrated-customer-writer';

@Injectable()
export class CustomerWriterResolver {
  constructor(
    private readonly settings: SettingsService,
    private readonly standalone: StandaloneCustomerWriter,
    private readonly integrated: IntegratedCustomerWriter,
  ) {}

  async resolve(tenantId: string): Promise<CustomerWriter> {
    const { ingestMode } = await this.settings.getOrderMode(tenantId);
    return ingestMode === 'integrated' ? this.integrated : this.standalone;
  }
}
