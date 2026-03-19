import { IsString, IsOptional, IsNumber, MaxLength, Min } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @MaxLength(50)
  tenantId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

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
