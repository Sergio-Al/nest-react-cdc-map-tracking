import { IsOptional, IsString, IsIn, IsBoolean, MaxLength } from 'class-validator';

const PRESETS = ['today', 'yesterday', '7d', '14d', '30d', 'mtd', 'qtd', 'ytd'];

/** Tenant default patch (admin only). Same fields as user, minus the
 * user-only theme/density. */
export class UpdateTenantSettingsDto {
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
  @IsIn(['standalone', 'integrated'])
  ingestMode?: string;

  @IsOptional()
  @IsBoolean()
  allowAppOrderCreate?: boolean;
}
