import { IsOptional, IsString, IsIn, MaxLength } from 'class-validator';

const PRESETS = ['today', 'yesterday', '7d', '14d', '30d', 'mtd', 'qtd', 'ytd'];

/**
 * Per-user override patch. Every field optional; omitted fields are left
 * unchanged, explicit fields are written. Timezone is validated for IANA
 * validity in the service (via Intl).
 */
export class UpdateUserSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsIn(['es', 'en'])
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  dateFormat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  numberFormat?: string;

  @IsOptional()
  @IsIn(['metric', 'imperial'])
  units?: string;

  @IsOptional()
  @IsIn(PRESETS)
  defaultReportPreset?: string;

  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: string;

  @IsOptional()
  @IsIn(['comfortable', 'compact'])
  density?: string;
}
