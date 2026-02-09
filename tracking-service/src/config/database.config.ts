import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

// ── Cache DB (Local PostgreSQL) ─────────────────────────────
export const cacheDbConfig: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  name: 'cacheDb',
  useFactory: (config: ConfigService) => ({
    type: 'postgres' as const,
    name: 'cacheDb',
    host: config.get<string>('cacheDb.host'),
    port: config.get<number>('cacheDb.port'),
    database: config.get<string>('cacheDb.database'),
    username: config.get<string>('cacheDb.username'),
    password: config.get<string>('cacheDb.password'),
    autoLoadEntities: true,
    synchronize: false, // We manage schema via SQL init scripts
    logging: config.get<string>('nodeEnv') === 'development',
  }),
};

// ── TimescaleDB connection options (for manual DataSource) ──
export const timescaleDbOptions = (config: ConfigService) => ({
  type: 'postgres' as const,
  host: config.get<string>('timescale.host'),
  port: config.get<number>('timescale.port'),
  database: config.get<string>('timescale.database'),
  username: config.get<string>('timescale.username'),
  password: config.get<string>('timescale.password'),
});

// ── MySQL connection options (for manual DataSource) ────────
export const mysqlDbOptions = (config: ConfigService) => ({
  type: 'mysql' as const,
  host: config.get<string>('mysql.host'),
  port: config.get<number>('mysql.port'),
  database: config.get<string>('mysql.database'),
  username: config.get<string>('mysql.username'),
  password: config.get<string>('mysql.password'),
});
