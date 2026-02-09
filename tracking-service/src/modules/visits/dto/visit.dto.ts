import { IsString, IsDateString, IsOptional, IsUUID, IsInt, IsIn } from 'class-validator';

export class CreateVisitDto {
  @IsString()
  tenantId!: string;

  @IsUUID()
  routeId!: string;

  @IsUUID()
  driverId!: string;

  @IsInt()
  customerId!: number;

  @IsInt()
  sequenceNumber!: number;

  @IsOptional()
  @IsIn(['delivery', 'pickup', 'service'])
  visitType?: string;

  @IsDateString()
  scheduledDate!: string;

  @IsOptional()
  @IsString()
  timeWindowStart?: string;

  @IsOptional()
  @IsString()
  timeWindowEnd?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateVisitStatusDto {
  @IsIn(['pending', 'en_route', 'arrived', 'in_progress', 'completed', 'skipped', 'failed'])
  status!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
