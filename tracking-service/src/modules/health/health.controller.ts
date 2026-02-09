import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { RedisService } from '../redis/redis.service';
import { TimescaleService } from '../timescale/timescale.service';
import { TrackingGateway } from '../websocket/tracking.gateway';
import { CdcMetricsService } from '../sync/cdc-metrics.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly redis: RedisService,
    private readonly timescale: TimescaleService,
    private readonly trackingGateway: TrackingGateway,
    private readonly cdcMetrics: CdcMetricsService,
  ) {}

  @Public()
  @Get()
  async check() {
    const [kafkaOk, redisOk, timescaleOk] = await Promise.all([
      this.kafkaProducer.isHealthy(),
      this.redis.isHealthy(),
      this.timescale.isHealthy(),
    ]);

    const wsStats = this.trackingGateway.getStats();
    const cdcMetrics = this.cdcMetrics.getTableMetrics();
    const maxLag = Math.max(...cdcMetrics.map((m) => m.lastEndToEndLagMs ?? 0), 0);

    // Determine CDC status based on lag thresholds
    let cdcStatus: 'healthy' | 'warning' | 'degraded' | 'critical';
    if (maxLag < 1000) {
      cdcStatus = 'healthy';
    } else if (maxLag < 5000) {
      cdcStatus = 'warning';
    } else if (maxLag < 30000) {
      cdcStatus = 'degraded';
    } else {
      cdcStatus = 'critical';
    }

    const allOk = kafkaOk && redisOk && timescaleOk && maxLag < 30000;
    const overallStatus = !allOk
      ? 'critical'
      : maxLag >= 5000
      ? 'degraded'
      : maxLag >= 1000
      ? 'warning'
      : 'ok';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        kafka: kafkaOk ? 'up' : 'down',
        redis: redisOk ? 'up' : 'down',
        timescale: timescaleOk ? 'up' : 'down',
      },
      websocket: {
        connectedClients: wsStats.connectedClients,
        activeRooms: wsStats.rooms,
      },
      cdc: {
        maxLagMs: maxLag,
        status: cdcStatus,
        tables: cdcMetrics.map((m) => ({
          table: m.table,
          lagMs: m.lastEndToEndLagMs,
          eventsProcessed: m.eventsProcessed,
          errors: m.errorsCount,
        })),
      },
    };
  }

  @Public()
  @Get('ready')
  ready() {
    return { status: 'ok' };
  }
}
