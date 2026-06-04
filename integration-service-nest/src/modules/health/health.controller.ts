import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';

@Controller()
export class HealthController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('healthz')
  healthz() {
    return { status: 'ok', service: 'integration-service' };
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  metricsText(): string {
    return this.metrics.renderPrometheus();
  }
}
