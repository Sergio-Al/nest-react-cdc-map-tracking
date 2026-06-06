import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
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
import { OrdersModule } from './modules/orders/orders.module';
import { EnrichmentModule } from './modules/enrichment/enrichment.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { DlqModule } from './modules/dlq/dlq.module';
import { HistoryModule } from './modules/history/history.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AppI18nModule } from './i18n/app-i18n.module';


@Module({
  imports: [
    // ── Global Config ──────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // ── Internationalization (Accept-Language → es/en) ─
    AppI18nModule,

    // ── Scheduled Tasks ────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Rate limiting (scoped per-route via @Throttle, not global) ─
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // ── BullMQ (background jobs, e.g. Traccar device sync) on the shared Redis ─
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
        },
      }),
    }),

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
    OrdersModule,
    EnrichmentModule,
    WebsocketModule,
    DlqModule,
    HistoryModule,
    VehiclesModule,
    SettingsModule,
    SubscriptionsModule,
    TenantsModule,
    HealthModule,
  ],
})
export class AppModule {}
