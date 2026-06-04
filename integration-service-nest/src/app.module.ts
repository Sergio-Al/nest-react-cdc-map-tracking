import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { coreBusinessDbConfig } from './database/database.config';
import { KafkaModule } from './modules/kafka/kafka.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { HealthModule } from './modules/health/health.module';
import { IntegrationModule } from './modules/integration/integration.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync(coreBusinessDbConfig),
    MetricsModule,
    KafkaModule,
    HealthModule,
    IntegrationModule,
  ],
})
export class AppModule {}
