import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateDriverDto {
  @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(50)
  phone?: string | null;

  @IsOptional() @IsString() @MaxLength(30)
  vehiclePlate?: string | null;

  @IsOptional() @IsString() @MaxLength(50)
  vehicleType?: string;

  @IsOptional() @IsString() @MaxLength(20)
  status?: string;

  @IsOptional() @IsString() @MaxLength(100)
  deviceId?: string | null;
}
