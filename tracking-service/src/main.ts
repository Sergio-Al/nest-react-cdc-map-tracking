import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nValidationPipe, I18nValidationExceptionFilter } from 'nestjs-i18n';
import { RedisIoAdapter } from './adapters/redis-io.adapter';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // rawBody: true captures the unparsed request buffer on `req.rawBody` (in
  // addition to normal JSON parsing) — required for Stripe webhook signature
  // verification, which must hash the exact bytes Stripe sent. No effect on
  // other routes.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  app.setGlobalPrefix('api');
  // Filter order matters: I18nValidationExceptionFilter handles
  // I18nValidationException (thrown by I18nValidationPipe). Anything else
  // — including business HttpExceptions — falls through to GlobalExceptionFilter.
  app.useGlobalFilters(
    new GlobalExceptionFilter(),
    new I18nValidationExceptionFilter({ detailedErrors: false }),
  );
  app.useGlobalPipes(
    new I18nValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  // Initialize the app (triggers onModuleInit for all modules, including RedisService)
  await app.init();

  // Configure WebSocket adapter with Redis for multi-instance support
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(port);
  logger.log(`🚀 Tracking Service running on port ${port}`);
}
bootstrap();
