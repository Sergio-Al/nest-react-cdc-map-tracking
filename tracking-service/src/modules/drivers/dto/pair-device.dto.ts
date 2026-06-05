import { IsString, IsOptional, MaxLength } from 'class-validator';

/** Bind (or, with null, clear) a phone's device_id to a driver. */
export class PairDeviceDto {
  @IsOptional() @IsString() @MaxLength(100)
  deviceId!: string | null;
}
