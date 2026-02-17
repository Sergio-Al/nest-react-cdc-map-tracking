import {
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReorderVisitItemDto {
  @IsUUID()
  visitId!: string;

  @IsInt()
  @Min(1)
  sequenceNumber!: number;
}

export class ReorderVisitsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderVisitItemDto)
  visits!: ReorderVisitItemDto[];
}
