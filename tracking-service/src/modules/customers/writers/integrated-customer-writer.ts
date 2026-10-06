import { PipelineTraceService } from '../../pipeline/pipeline-trace.service';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { KafkaProducerService } from '../../kafka/kafka-producer.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { CustomerWriter, CustomerWriteResult } from '../customer-writer.interface';

@Injectable()
export class IntegratedCustomerWriter implements CustomerWriter {
  constructor(private readonly kafkaProducer: KafkaProducerService, private readonly traces: PipelineTraceService) {}

  async createCustomer(tenantId: string, dto: CreateCustomerDto): Promise<CustomerWriteResult> {
    const correlationId = randomUUID();
    await this.traces.start({ correlationId, tenantId, entity: 'customers', op: 'create', mode: 'integrated' });
    await this.kafkaProducer.produce('commands.customers', {
      key: tenantId,
      value: JSON.stringify({ op: 'create', correlationId, data: { ...dto, tenantId } }),
    });
    await this.traces.append(correlationId, 'kafka.produced');
    return { mode: 'async', correlationId };
  }

  async updateCustomer(tenantId: string, id: number, dto: UpdateCustomerDto): Promise<CustomerWriteResult> {
    const correlationId = randomUUID();
    await this.traces.start({ correlationId, tenantId, entity: 'customers', op: 'update', mode: 'integrated' });
    await this.kafkaProducer.produce('commands.customers', {
      key: tenantId,
      value: JSON.stringify({ op: 'update', correlationId, data: { ...dto, tenantId, id } }),
    });
    await this.traces.append(correlationId, 'kafka.produced');
    return { mode: 'async', correlationId };
  }
}
