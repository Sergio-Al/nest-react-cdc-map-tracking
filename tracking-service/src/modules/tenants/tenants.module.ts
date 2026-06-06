import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantsService } from './tenants.service';

/**
 * Workspace registry. PG-owned anchor for tenant uniqueness + display name,
 * consumed by the public signup flow (AuthModule imports this).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Tenant], 'cacheDb')],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
