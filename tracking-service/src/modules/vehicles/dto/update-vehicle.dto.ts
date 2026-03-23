import { IsString, IsOptional, IsInt, IsUUID, IsNumber, MaxLength, Min, Max } from 'class-validator';

export class UpdateVehicleDto {
  @IsOptional() @IsString() @MaxLength(30)
  plate?: string;

  @IsOptional() @IsString() @MaxLength(50)
  type?: string;

  @IsOptional() @IsString() @MaxLength(100)
  brand?: string | null;

  @IsOptional() @IsString() @MaxLength(100)
  model?: string | null;

  @IsOptional() @IsInt() @Min(1900) @Max(2100)
  year?: number | null;

  @IsOptional() @IsString() @MaxLength(50)
  color?: string | null;

  @IsOptional() @IsNumber()
  capacityKg?: number | null;

  @IsOptional() @IsString() @MaxLength(20)
  status?: string;

  @IsOptional() @IsUUID()
  driverId?: string | null;

  @IsOptional() @IsString()
  notes?: string | null;
}
