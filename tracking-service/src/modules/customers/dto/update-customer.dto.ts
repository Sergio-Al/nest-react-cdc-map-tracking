import { IsString, IsOptional, IsNumber, MaxLength, Min } from 'class-validator';

/**
 * Partial update for a customer. Emitted as `commands.customers` op:'update'
 * (async, 202) and applied to MySQL by the integration-service, then reflected
 * back into customers_cache via CDC. tenantId scopes the update; all business
 * fields are optional so callers can change just what they need.
 */
export class UpdateCustomerDto {
  @IsString()
  @MaxLength(50)
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  zone?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  geofenceRadiusMeters?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerType?: string;
}
