import { Controller, Get, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CachedAccount,
  CachedCustomer,
  CachedProduct,
  SyncState,
} from './entities';
import { CdcMetricsService, CdcLagSnapshot } from './cdc-metrics.service';

/**
 * Debug / inspection controller for the CDC sync cache.
 * Lets you verify that Debezium changes are landing correctly.
 * Admin-only access.
 */
@Roles('admin')
@Controller('sync')
export class SyncController {
  constructor(
    private readonly cdcMetrics: CdcMetricsService,

    @InjectRepository(CachedAccount, 'cacheDb')
    private readonly accountRepo: Repository<CachedAccount>,

    @InjectRepository(CachedCustomer, 'cacheDb')
    private readonly customerRepo: Repository<CachedCustomer>,

    @InjectRepository(CachedProduct, 'cacheDb')
    private readonly productRepo: Repository<CachedProduct>,

    @InjectRepository(SyncState, 'cacheDb')
    private readonly syncStateRepo: Repository<SyncState>,
  ) {}

  @Get('status')
  async getSyncStatus() {
    const states = await this.syncStateRepo.find();
    return {
      tables: states,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('lag')
  async getCdcLag(): Promise<CdcLagSnapshot> {
    return this.cdcMetrics.getSnapshot();
  }

  @Get('accounts')
  findAllAccounts(@CurrentUser() user: any) {
    return this.accountRepo.find({ where: { tenantId: user.tenantId } });
  }

  @Get('accounts/:id')
  findAccount(@Param('id') id: number, @CurrentUser() user: any) {
    return this.accountRepo.findOne({ where: { id, tenantId: user.tenantId } });
  }

  @Get('customers')
  findAllCustomers(@CurrentUser() user: any) {
    return this.customerRepo.find({ where: { tenantId: user.tenantId } });
  }

  @Get('customers/:id')
  findCustomer(@Param('id') id: number, @CurrentUser() user: any) {
    return this.customerRepo.findOne({ where: { id, tenantId: user.tenantId } });
  }

  @Get('products')
  findAllProducts(@CurrentUser() user: any) {
    return this.productRepo.find({ where: { tenantId: user.tenantId } });
  }

  @Get('products/:id')
  findProduct(@Param('id') id: number, @CurrentUser() user: any) {
    return this.productRepo.findOne({ where: { id, tenantId: user.tenantId } });
  }
}
