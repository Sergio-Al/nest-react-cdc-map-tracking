import { IsString, IsOptional, IsInt, IsUUID, IsNumber, MaxLength, Min, Max } from 'class-validator';

export class CreateVehicleDto {
  // Server-authoritative: the controller overwrites this from the JWT, so it's
  // optional in the body (clients shouldn't — and needn't — send it).
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tenantId?: string;

  @IsString()
  @MaxLength(30)
  plate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string | null;

  @IsOptional()
  @IsNumber()
  capacityKg?: number | null;

  @IsOptional()
  @IsUUID()
  driverId?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
