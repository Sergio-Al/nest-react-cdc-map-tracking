import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { RedisService } from '../modules/redis/redis.service';

/**
 * Custom Socket.io adapter that uses Redis for pub/sub.
 * Enables horizontal scaling across multiple NestJS instances.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(
    private readonly app: INestApplicationContext,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisService = this.app.get(RedisService);
    const baseClient = redisService.getClient();

    if (!baseClient) {
      throw new Error('Redis client not initialized in RedisService');
    }

    // Create two separate clients for pub/sub
    // Socket.io Redis adapter requires dedicated pub and sub clients
    const pubClient = baseClient.duplicate();
    const subClient = baseClient.duplicate();

    // Wait for both clients to be ready
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        if (pubClient.status === 'ready') {
          this.logger.log('Redis pub client connected for Socket.io');
          resolve();
        } else {
          pubClient.on('ready', () => {
            this.logger.log('Redis pub client connected for Socket.io');
            resolve();
          });
          pubClient.on('error', (err) => {
            this.logger.error('Redis pub client error', err);
            reject(err);
          });
        }
      }),
      new Promise<void>((resolve, reject) => {
        if (subClient.status === 'ready') {
          this.logger.log('Redis sub client connected for Socket.io');
          resolve();
        } else {
          subClient.on('ready', () => {
            this.logger.log('Redis sub client connected for Socket.io');
            resolve();
          });
          subClient.on('error', (err) => {
            this.logger.error('Redis sub client error', err);
            reject(err);
          });
        }
      }),
    ]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Redis adapter initialized for Socket.io');
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
