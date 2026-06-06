import { IsString, IsOptional, MaxLength } from "class-validator";

export class CreateDriverDto {

  // Server-authoritative: the controller overwrites this from the JWT, so it's
  // optional in the body (clients shouldn't — and needn't — send it).
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceId?: string | null;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vehiclePlate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

}
