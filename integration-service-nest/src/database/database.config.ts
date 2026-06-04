import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * MySQL `core_business` connection — the source-of-truth DB.
 *
 * This service is the *only* writer of these tables. The schema is owned by
 * the SQL init scripts in `infrastructure/mysql/init/`, so `synchronize` MUST
 * stay `false`; the entities only describe the columns we insert into.
 */
export const coreBusinessDbConfig: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'mysql' as const,
    host: config.get<string>('mysql.host'),
    port: config.get<number>('mysql.port'),
    database: config.get<string>('mysql.database'),
    username: config.get<string>('mysql.username'),
    password: config.get<string>('mysql.password'),
    autoLoadEntities: true,
    synchronize: false, // schema managed by infrastructure/mysql/init/*.sql
    logging: config.get<string>('nodeEnv') === 'development',
  }),
};
