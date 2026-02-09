import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { cacheDbConfig } from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { TraccarModule } from './modules/traccar/traccar.module';
import { KafkaModule } from './modules/kafka/kafka.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { SyncModule } from './modules/sync/sync.module';
import { HealthModule } from './modules/health/health.module';
import { RedisModule } from './modules/redis/redis.module';
import { TimescaleModule } from './modules/timescale/timescale.module';
import { CustomersModule } from './modules/customers/customers.module';
import { RoutesModule } from './modules/routes/routes.module';
import { VisitsModule } from './modules/visits/visits.module';
import { EnrichmentModule } from './modules/enrichment/enrichment.module';
import { WebsocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [
    // ── Global Config ──────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // ── Scheduled Tasks ────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Cache DB (Local PostgreSQL) ────────────────────
    TypeOrmModule.forRootAsync(cacheDbConfig),

    // ── Global Services ────────────────────────────────
    RedisModule,
    TimescaleModule,
    KafkaModule,

    // ── Feature Modules ────────────────────────────────
    AuthModule,
    TraccarModule,
    DriversModule,
    SyncModule,
    CustomersModule,
    RoutesModule,
    VisitsModule,
    EnrichmentModule,
    WebsocketModule,
    HealthModule,
  ],
})
export class AppModule {}
