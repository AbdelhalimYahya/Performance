import { Injectable, Logger } from '@nestjs/common';

/**
 * STATELESS SERVICE
 *
 * Demonstrates the patterns for making NestJS horizontally scalable:
 * - Redis-backed session store
 * - Redis-backed rate limiter
 * - Redis-backed distributed lock for scheduled jobs
 */
@Injectable()
export class StatelessService {
  private readonly logger = new Logger(StatelessService.name);

  /**
   * In-memory session store — BROKEN for multi-worker.
   * Worker A stores session, Worker B doesn't have it.
   *
   * ❌ BAD:
   * private sessions = new Map<string, any>();
   * getSession(id: string) { return this.sessions.get(id); }
   *
   * ✅ GOOD: Redis store (see Bull Queue module's Redis config)
   * const session = await redis.get(`session:${id}`);
   */
  async checkSessionStore(): Promise<{ type: string; status: string }> {
    // In production: check Redis connection
    return { type: 'redis', status: 'connected' };
  }

  /**
   * In-memory rate limiter — BROKEN for multi-worker.
   * Each worker counts independently, so effective limit is N×limit.
   *
   * ❌ BAD:
   * private counters = new Map<string, { count: number; resetAt: number }>();
   *
   * ✅ GOOD: Redis INCR + EXPIRE (atomic)
   * const key = `ratelimit:${ip}:${window}`;
   * const count = await redis.incr(key);
   * if (count === 1) await redis.expire(key, windowSeconds);
   */
  async checkRateLimit(ip: string, windowSec = 60, limit = 100): Promise<{ allowed: boolean; remaining: number }> {
    // In production: Redis INCR + EXPIRE
    return { allowed: true, remaining: limit - 1 };
  }

  /**
   * In-memory scheduled jobs — BROKEN for multi-worker.
   * setInterval runs on every worker, so job executes N times.
   *
   * ❌ BAD:
   * setInterval(() => this.cleanup(), 3600000); // runs on every worker!
   *
   * ✅ GOOD: Bull Queue with Redis lock
   * await queue.add('cleanup', {}, { jobId: 'hourly-cleanup', repeat: { cron: '0 * * * *' } });
   * Or: @nestjs/schedule with distributed lock via Redis
   */
  async checkScheduledJobs(): Promise<{ type: string; status: string }> {
    return { type: 'bull', status: 'using-redis-lock' };
  }
}
