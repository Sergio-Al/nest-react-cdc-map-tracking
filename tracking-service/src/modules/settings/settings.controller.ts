import { Controller, Get, Put, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ── Current user ──────────────────────────────────────────
  @Get('me/settings')
  async getMine(@CurrentUser() user: any) {
    const [effective, raw, tenant] = await Promise.all([
      this.settingsService.getEffective(user.userId, user.tenantId),
      this.settingsService.getUserRaw(user.userId),
      this.settingsService.getTenantRaw(user.tenantId),
    ]);
    return { effective, user: raw, tenant };
  }

  @Put('me/settings')
  async updateMine(@CurrentUser() user: any, @Body() dto: UpdateUserSettingsDto) {
    const effective = await this.settingsService.updateUser(user.userId, user.tenantId, dto);
    return { effective };
  }

  // ── Tenant defaults (admin) ───────────────────────────────
  @Roles('admin')
  @Get('tenant/settings')
  getTenant(@CurrentUser() user: any) {
    return this.settingsService.getTenantRaw(user.tenantId);
  }

  @Roles('admin')
  @Put('tenant/settings')
  updateTenant(@CurrentUser() user: any, @Body() dto: UpdateTenantSettingsDto) {
    return this.settingsService.updateTenant(user.tenantId, dto);
  }
}
