import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantSettings } from './entities/tenant-settings.entity';
import { UserSettings } from './entities/user-settings.entity';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

/** Flat, fully-resolved preferences the app consumes. */
export interface EffectiveSettings {
  timezone: string;
  locale: string;
  dateFormat: string;
  numberFormat: string;
  units: string;
  defaultReportPreset: string;
  theme: string; // user-only
  density: string; // user-only
}

/** Final fallback when neither user nor tenant has a value. */
export const SYSTEM_DEFAULTS: EffectiveSettings = {
  timezone: 'America/La_Paz',
  locale: 'es',
  dateFormat: 'dd/MM/yyyy',
  numberFormat: 'es-BO',
  units: 'metric',
  defaultReportPreset: '14d',
  theme: 'system',
  density: 'comfortable',
};

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(TenantSettings, 'cacheDb')
    private readonly tenantRepo: Repository<TenantSettings>,
    @InjectRepository(UserSettings, 'cacheDb')
    private readonly userRepo: Repository<UserSettings>,
  ) {}

  /** user value ?? tenant value ?? system default (theme/density: user-only). */
  async getEffective(userId: string, tenantId: string): Promise<EffectiveSettings> {
    const [tenant, user] = await Promise.all([
      this.tenantRepo.findOne({ where: { tenantId } }),
      this.userRepo.findOne({ where: { userId } }),
    ]);

    const pick = <K extends keyof EffectiveSettings>(key: K): string => {
      const u = user?.[key as keyof UserSettings] as string | null | undefined;
      const t = tenant?.[key as keyof TenantSettings] as string | null | undefined;
      return (u ?? t ?? SYSTEM_DEFAULTS[key]) as string;
    };

    return {
      timezone: pick('timezone'),
      locale: pick('locale'),
      dateFormat: pick('dateFormat'),
      numberFormat: pick('numberFormat'),
      units: pick('units'),
      defaultReportPreset: pick('defaultReportPreset'),
      // user-only — tenant has no column for these
      theme: user?.theme ?? SYSTEM_DEFAULTS.theme,
      density: user?.density ?? SYSTEM_DEFAULTS.density,
    };
  }

  async getUserRaw(userId: string): Promise<UserSettings | null> {
    return this.userRepo.findOne({ where: { userId } });
  }

  async getTenantRaw(tenantId: string): Promise<TenantSettings | null> {
    return this.tenantRepo.findOne({ where: { tenantId } });
  }

  async updateUser(
    userId: string,
    tenantId: string,
    dto: UpdateUserSettingsDto,
  ): Promise<EffectiveSettings> {
    if (dto.timezone) this.assertValidTimezone(dto.timezone);
    const existing = await this.userRepo.findOne({ where: { userId } });
    const row = existing ?? this.userRepo.create({ userId, tenantId });
    Object.assign(row, dto);
    row.tenantId = tenantId; // keep ownership consistent
    await this.userRepo.save(row);
    return this.getEffective(userId, tenantId);
  }

  async updateTenant(
    tenantId: string,
    dto: UpdateTenantSettingsDto,
  ): Promise<TenantSettings> {
    if (dto.timezone) this.assertValidTimezone(dto.timezone);
    const existing = await this.tenantRepo.findOne({ where: { tenantId } });
    const row = existing ?? this.tenantRepo.create({ tenantId });
    Object.assign(row, dto);
    return this.tenantRepo.save(row);
  }

  private assertValidTimezone(tz: string): void {
    try {
      // Throws RangeError for an invalid IANA zone.
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
    } catch {
      throw new BadRequestException({ errorCode: 'settings.invalidTimezone', args: { tz } });
    }
  }
}
