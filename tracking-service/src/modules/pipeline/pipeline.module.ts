import { Global, Module } from '@nestjs/common';
import { WebsocketModule } from '../websocket/websocket.module';
import { PipelineTraceService } from './pipeline-trace.service';
import { PipelineConsumerService } from './pipeline-consumer.service';
import { PipelineController } from './pipeline.controller';

@Global()
@Module({
  imports: [WebsocketModule],
  controllers: [PipelineController],
  providers: [PipelineTraceService, PipelineConsumerService],
  exports: [PipelineTraceService],
})
export class PipelineModule {}
