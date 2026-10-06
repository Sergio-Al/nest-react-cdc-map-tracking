import { CachedCustomer } from '../sync/entities/cached-customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

export type CustomerWriteResult =
  | { mode: 'sync'; correlationId?: string; customer: CachedCustomer }
  | { mode: 'async'; correlationId: string };

export interface CustomerWriter {
  createCustomer(tenantId: string, dto: CreateCustomerDto): Promise<CustomerWriteResult>;
  updateCustomer(tenantId: string, id: number, dto: UpdateCustomerDto): Promise<CustomerWriteResult>;
}
