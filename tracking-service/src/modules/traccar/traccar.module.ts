import { Module } from '@nestjs/common';
import { TraccarController } from './traccar.controller';
import { TraccarIngestionService } from './traccar-ingestion.service';

@Module({
  controllers: [TraccarController],
  providers: [TraccarIngestionService],
  exports: [TraccarIngestionService],
})
export class TraccarModule {}
