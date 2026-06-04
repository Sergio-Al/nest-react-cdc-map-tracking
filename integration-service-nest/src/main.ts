import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Flush Kafka consumers / DB pool cleanly on SIGTERM/SIGINT (Docker stop).
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('httpPort', 8090);

  await app.listen(port);
  logger.log(`🔌 integration-service (NestJS) listening on :${port}`);
}

bootstrap();
