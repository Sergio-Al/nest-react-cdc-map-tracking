import {
  IsString,
  IsInt,
  IsOptional,
  IsNumber,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Create an order. The write path is resolved per tenant:
 *   • standalone → direct PG insert (synchronous, 201)
 *   • integrated + allow_app_order_create → commands.orders op:'create' (async, 202)
 *   • integrated + create disabled → 403 (orders are ERP/CDC-originated)
 * tenantId is taken from the JWT, not this body (kept here for frontend parity).
 */
export class CreateOrderDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsInt()
  customerId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  orderNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
