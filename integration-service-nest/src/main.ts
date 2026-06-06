import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // bufferLogs: true holds startup logs until the Pino logger is attached below,
  // then flushes them through it. After useLogger(), every existing
  // `new Logger(context)` call site routes through Pino.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  // Flush Kafka consumers / DB pool cleanly on SIGTERM/SIGINT (Docker stop).
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('httpPort', 8090);

  await app.listen(port);
  logger.log(`🔌 integration-service (NestJS) listening on :${port}`);
}

bootstrap();
