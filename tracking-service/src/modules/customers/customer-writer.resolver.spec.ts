import { Repository } from 'typeorm';
import { CustomerWriterResolver } from './customer-writer.resolver';
import { StandaloneCustomerWriter } from './writers/standalone-customer-writer';
import { IntegratedCustomerWriter } from './writers/integrated-customer-writer';
import { SettingsService } from '../settings/settings.service';
import { TenantSettings } from '../settings/entities/tenant-settings.entity';
import { UserSettings } from '../settings/entities/user-settings.entity';
import { EntitlementsService } from '../subscriptions/entitlements.service';

describe('CustomerWriterResolver', () => {
  const standalone = {} as StandaloneCustomerWriter;
  const integrated = {} as IntegratedCustomerWriter;
  let tenantRepo: { findOne: jest.Mock };
  let resolver: CustomerWriterResolver;

  beforeEach(() => {
    tenantRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const settings = new SettingsService(
      tenantRepo as unknown as Repository<TenantSettings>,
      {} as Repository<UserSettings>, {} as EntitlementsService,
    );
    resolver = new CustomerWriterResolver(settings, standalone, integrated);
  });

  it('defaults to standalone when the tenant has no settings row', async () => {
    expect(await resolver.resolve('new-tenant')).toBe(standalone);
    expect(tenantRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: 'new-tenant' } });
  });

  it('selects the integrated writer when configured, independent of the order-create gate', async () => {
    tenantRepo.findOne.mockResolvedValue({ ingestMode: 'integrated', allowAppOrderCreate: false });
    expect(await resolver.resolve('tenant-1')).toBe(integrated);
  });
});
