import { Controller, Get, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  findAllAccounts() {
    return this.accountRepo.find();
  }

  @Get('accounts/:id')
  findAccount(@Param('id') id: number) {
    return this.accountRepo.findOne({ where: { id } });
  }

  @Get('customers')
  findAllCustomers() {
    return this.customerRepo.find();
  }

  @Get('customers/:id')
  findCustomer(@Param('id') id: number) {
    return this.customerRepo.findOne({ where: { id } });
  }

  @Get('products')
  findAllProducts() {
    return this.productRepo.find();
  }

  @Get('products/:id')
  findProduct(@Param('id') id: number) {
    return this.productRepo.findOne({ where: { id } });
  }
}
