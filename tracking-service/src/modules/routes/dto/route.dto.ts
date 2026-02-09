import { IsString, IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreateRouteDto {
  @IsString()
  tenantId!: string;

  @IsUUID()
  driverId!: string;

  @IsDateString()
  scheduledDate!: string;
}

export class UpdateRouteDto {
  @IsOptional()
  @IsString()
  status?: string;
}
