import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { StatelessService } from './stateless.service';

/**
 * STATELESS MODULE
 *
 * For horizontal scaling (multiple instances behind a load balancer):
 * 1. Sessions → Redis (not in-memory Map, not cookie-session)
 * 2. Rate limiting → Redis (not in-memory counter)
 * 3. Scheduled jobs → Bull Queue with Redis lock (not setInterval)
 * 4. Health checks → must verify DB + Redis + dependencies
 *
 * In-process state (Map, Set,闭包) is per-worker.
 * Worker 1's cache ≠ Worker 2's cache.
 * Redis is the shared state layer.
 */
@Module({
  controllers: [HealthController],
  providers: [StatelessService],
  exports: [StatelessService],
})
export class StatelessModule {}
