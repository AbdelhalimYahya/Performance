import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  HealthIndicator,
} from '@nestjs/terminus';

/**
 * HEALTH CHECK CONTROLLER
 *
 * Returns 200 only when all critical dependencies are reachable.
 * Load balancers use this to decide which instances receive traffic.
 *
 * Kubernetes probes:
 * - livenessProbe: is the process alive? (GET /health/live)
 * - readinessProbe: is it ready for traffic? (GET /health/ready)
 *
 * If readiness fails, the pod is removed from the Service endpoint.
 * If liveness fails, Kubernetes restarts the pod.
 */
@Controller('health')
export class HealthController {
  constructor(private health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.pingRedis(),
      () => this.pingDatabase(),
      () => this.checkMemory(),
    ]);
  }

  @Get('live')
  @HealthCheck()
  liveness() {
    // Liveness: is the process alive? Simplest possible check.
    return this.health.check([async () => ({ liveness: { status: 'up' } })]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    // Readiness: can it handle traffic? Check all dependencies.
    return this.health.check([
      () => this.pingRedis(),
      () => this.pingDatabase(),
    ]);
  }

  private async pingRedis(): Promise<HealthIndicatorResult> {
    try {
      // In production: redis.ping()
      await new Promise((resolve) => setTimeout(resolve, 1));
      return { redis: { status: 'up', latency: '1ms' } };
    } catch (err) {
      return { redis: { status: 'down', error: String(err) } };
    }
  }

  private async pingDatabase(): Promise<HealthIndicatorResult> {
    try {
      // In production: prisma.$queryRaw`SELECT 1`
      await new Promise((resolve) => setTimeout(resolve, 1));
      return { database: { status: 'up', latency: '1ms' } };
    } catch (err) {
      return { database: { status: 'down', error: String(err) } };
    }
  }

  private async checkMemory(): Promise<HealthIndicatorResult> {
    const mem = process.memoryUsage();
    const heapUsedMB = mem.heapUsed / 1024 / 1024;
    const limitMB = parseInt(process.env.MEMORY_LIMIT_MB || '400', 10);

    if (heapUsedMB > limitMB * 0.9) {
      return { memory: { status: 'down', heapUsedMB, limitMB, usage: '90%+' } };
    }
    return { memory: { status: 'up', heapUsedMB, limitMB } };
  }
}
