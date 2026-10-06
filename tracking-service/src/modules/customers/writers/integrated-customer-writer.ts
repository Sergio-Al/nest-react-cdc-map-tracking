import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { KafkaProducerService } from '../../kafka/kafka-producer.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { CustomerWriter, CustomerWriteResult } from '../customer-writer.interface';

@Injectable()
export class IntegratedCustomerWriter implements CustomerWriter {
  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  async createCustomer(tenantId: string, dto: CreateCustomerDto): Promise<CustomerWriteResult> {
    const correlationId = randomUUID();
    await this.kafkaProducer.produce('commands.customers', {
      key: tenantId,
      value: JSON.stringify({ op: 'create', correlationId, data: { ...dto, tenantId } }),
    });
    return { mode: 'async', correlationId };
  }

  async updateCustomer(tenantId: string, id: number, dto: UpdateCustomerDto): Promise<CustomerWriteResult> {
    const correlationId = randomUUID();
    await this.kafkaProducer.produce('commands.customers', {
      key: tenantId,
      value: JSON.stringify({ op: 'update', correlationId, data: { ...dto, tenantId, id } }),
    });
    return { mode: 'async', correlationId };
  }
}
