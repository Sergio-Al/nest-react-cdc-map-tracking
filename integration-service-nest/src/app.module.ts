import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
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

    // ── Structured logging (Pino → stdout + rotating disk file) ─
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const log = config.get<{
          level: string;
          dir: string;
          file: string;
          maxSize: string;
          rotateIntervalMs: number;
          retainCount: number;
          pretty: boolean;
        }>('logging')!;

        // Persist to a rotating file AND mirror to stdout (so `docker logs` works):
        // pretty-printed in dev, JSON to fd 1 in production.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const targets: any[] = [
          {
            target: 'pino-roll',
            level: log.level,
            options: {
              file: `${log.dir}/${log.file}`,
              size: log.maxSize, // rotate at e.g. 1MB
              frequency: log.rotateIntervalMs, // …or every 3 days, whichever first
              mkdir: true, // auto-create the logs/ directory
              dateFormat: 'yyyy-MM-dd',
              limit: { count: log.retainCount }, // keep newest N, delete oldest
            },
          },
          log.pretty
            ? {
                target: 'pino-pretty',
                level: log.level,
                options: { colorize: true, singleLine: true, translateTime: 'SYS:standard' },
              }
            : { target: 'pino/file', level: log.level, options: { destination: 1 } },
        ];

        return {
          pinoHttp: {
            level: log.level,
            autoLogging: false, // no per-request HTTP access logs
            redact: ['req.headers.authorization', 'req.headers.cookie', '*.password'],
            transport: { targets },
          },
        };
      },
    }),

    TypeOrmModule.forRootAsync(coreBusinessDbConfig),
    MetricsModule,
    KafkaModule,
    HealthModule,
    IntegrationModule,
  ],
})
export class AppModule {}
