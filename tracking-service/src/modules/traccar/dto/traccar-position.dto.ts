import { IsNumber, IsOptional, IsString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO matching the JSON payload Traccar sends via its forward.url webhook.
 * See https://www.traccar.org/documentation/protocols/json
 */
export class TraccarPositionDto {
  @IsString()
  id!: string;

  @IsString()
  deviceId!: string;

  @IsOptional()
  @IsString()
  protocol?: string;

  @IsString()
  deviceTime!: string;

  @IsString()
  fixTime!: string;

  @IsString()
  serverTime!: string;

  @IsBoolean()
  @IsOptional()
  outdated?: boolean;

  @IsBoolean()
  @IsOptional()
  valid?: boolean;

  @Type(() => Number)
  @IsNumber()
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  longitude!: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  altitude?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  speed?: number; // knots

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  course?: number; // heading in degrees

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  accuracy?: number;

  @IsOptional()
  attributes?: Record<string, unknown>;
}

export class TraccarEventDto {
  @IsString()
  id!: string;

  @IsString()
  type!: string;

  @IsString()
  deviceId!: string;

  @IsString()
  @IsOptional()
  positionId?: string;

  @IsString()
  @IsOptional()
  geofenceId?: string;

  @IsString()
  @IsOptional()
  maintenanceId?: string;

  @IsOptional()
  attributes?: Record<string, unknown>;

  @IsString()
  eventTime!: string;
}
