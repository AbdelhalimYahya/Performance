/**
 * HEALTH CONTROLLER — Comprehensive Health Check
 *
 * GET /health — returns 200 (ok/degraded) or 503 (down).
 *
 * Used by load balancer health checks and Kubernetes readiness probes.
 * Each dependency check has a 2000ms timeout — if DB takes longer than 2s,
 * it is "degraded" not "ok".
 *
 * Response:
 *   {
 *     status: "ok" | "degraded" | "down",
 *     uptime: 12345,
 *     version: "1.0.0",
 *     checks: {
 *       database: { status: "ok", latencyMs: 12 },
 *       redis: { status: "ok", latencyMs: 3 },
 *       memory: { status: "ok", heapUsedPercent: 65 },
 *       eventLoop: { status: "ok", lagMs: 2 },
 *     }
 *   }
 */

import { Controller, Get } from '@nestjs/common';

// ─── Types ───────────────────────────────────────────────────────────────

interface HealthCheck {
  status: 'ok' | 'degraded' | 'down' | 'unknown';
  latencyMs?: number;
  message?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  uptime: number;
  version: string;
  timestamp: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    memory: HealthCheck;
    eventLoop: HealthCheck;
  };
}

// ─── Controller ──────────────────────────────────────────────────────────

@Controller()
export class HealthController {
  @Get('health')
  async getHealth(): Promise<HealthResponse> {
    const startTime = Date.now();
    const version = process.env.APP_VERSION || '1.0.0';

    // Run all checks in parallel with individual timeouts
    const [database, redis, memory, eventLoop] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory(),
      this.checkEventLoop(),
    ]);

    // Determine overall status
    const checks = { database, redis, memory, eventLoop };
    const statuses = Object.values(checks).map((c) => c.status);

    let overallStatus: 'ok' | 'degraded' | 'down';
    if (statuses.every((s) => s === 'ok')) {
      overallStatus = 'ok';
    } else if (statuses.some((s) => s === 'down')) {
      overallStatus = 'down';
    } else {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      uptime: process.uptime(),
      version,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  // ─── Individual Checks ─────────────────────────────────────────────

  private async checkDatabase(): Promise<HealthCheck> {
    try {
      const start = Date.now();
      // Lightweight query — just test connectivity
      // Replace with your actual DB client:
      // await this.prisma.$queryRaw`SELECT 1`;
      await this.withTimeout(
        new Promise((resolve) => setTimeout(resolve, 5)), // Simulated
        2000
      );
      const latencyMs = Date.now() - start;

      return {
        status: latencyMs > 1000 ? 'degraded' : 'ok',
        latencyMs,
      };
    } catch (error) {
      return {
        status: 'down',
        message: (error as Error).message,
      };
    }
  }

  private async checkRedis(): Promise<HealthCheck> {
    try {
      const start = Date.now();
      // Replace with actual Redis ping:
      // await this.redis.ping();
      await this.withTimeout(
        new Promise((resolve) => setTimeout(resolve, 2)), // Simulated
        2000
      );
      const latencyMs = Date.now() - start;

      return {
        status: latencyMs > 500 ? 'degraded' : 'ok',
        latencyMs,
      };
    } catch (error) {
      return {
        status: 'down',
        message: (error as Error).message,
      };
    }
  }

  private checkMemory(): Promise<HealthCheck> {
    const mem = process.memoryUsage();
    const heapUsedPercent = (mem.heapUsed / mem.heapTotal) * 100;

    let status: 'ok' | 'degraded' | 'down';
    if (heapUsedPercent < 80) {
      status = 'ok';
    } else if (heapUsedPercent < 95) {
      status = 'degraded';
    } else {
      status = 'down';
    }

    return Promise.resolve({
      status,
      message: `${heapUsedPercent.toFixed(1)}% used`,
    });
  }

  private checkEventLoop(): Promise<HealthCheck> {
    // Measure event loop lag with a timer-tick
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lagMs = Number(process.hrtime.bigint() - start) / 1e6;
        let status: 'ok' | 'degraded' | 'down';
        if (lagMs < 50) {
          status = 'ok';
        } else if (lagMs < 200) {
          status = 'degraded';
        } else {
          status = 'down';
        }
        resolve({ status, latencyMs: parseFloat(lagMs.toFixed(2)) });
      });
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
      ),
    ]);
  }
}
