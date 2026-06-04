import {
  IsString,
  IsDateString,
  IsOptional,
  IsUUID,
  IsLatitude,
  IsLongitude,
  IsBoolean,
  IsIn,
  MaxLength,
} from 'class-validator';

export const ROUTE_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const;

export class CreateRouteDto {
  @IsString()
  tenantId!: string;

  @IsUUID()
  driverId!: string;

  @IsDateString()
  scheduledDate!: string;

  // Optional starting point. Omit both to keep the route "dynamic" (origin
  // resolves to the driver's live GPS at optimization time).
  @IsOptional()
  @IsLatitude()
  depotLat?: number;

  @IsOptional()
  @IsLongitude()
  depotLon?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  depotLabel?: string;

  @IsOptional()
  @IsBoolean()
  returnToDepot?: boolean;
}

export class UpdateRouteDto {
  @IsOptional()
  @IsIn(ROUTE_STATUSES)
  status?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  // Set depotLat AND depotLon together to pin a fixed starting point, or
  // set both to null to clear the pin (back to dynamic / driver live GPS).
  @IsOptional()
  @IsLatitude()
  depotLat?: number | null;

  @IsOptional()
  @IsLongitude()
  depotLon?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  depotLabel?: string | null;

  @IsOptional()
  @IsBoolean()
  returnToDepot?: boolean;
}
