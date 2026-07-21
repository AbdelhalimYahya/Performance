/**
 * METRICS MODULE — Prometheus Metrics Provider
 *
 * Registers default metrics, provides MetricsService, and
 * configures the /metrics endpoint via MetricsController.
 */

import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
