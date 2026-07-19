/**
 * PoolMonitorService — periodically monitors connection pool health.
 *
 * Runs every 30 seconds via @Cron to:
 * - Track max connections ever seen
 * - Alert if waiting > 0 (pool may be too small)
 * - Alert if active > pool_size * 0.8 (high utilization)
 * - Maintain a rolling history of the last 100 snapshots
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService, PoolStats } from './prisma.service';

export interface PoolSnapshot {
  timestamp: Date;
  stats: PoolStats;
  alerts: string[];
}

@Injectable()
export class PoolMonitorService {
  private readonly logger = new Logger(PoolMonitorService.name);

  /**
   * Rolling history buffer — stores the last 100 pool snapshots.
   * Oldest entries are overwritten when the buffer is full.
   */
  private readonly history: PoolSnapshot[] = [];
  private static readonly MAX_HISTORY = 100;

  /**
   * High-water mark for active connections since last reset.
   */
  private maxActiveSeen = 0;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cron job: collect pool stats every 30 seconds.
   * Logs alerts when pool is under stress.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async collectStats(): Promise<void> {
    const stats = await this.prisma.getPoolStats();
    const alerts: string[] = [];

    // Alert: connections waiting — pool may be too small
    if (stats.waiting > 0) {
      const msg = `POOL WAITING: ${stats.waiting} connection(s) waiting — consider increasing pool_size`;
      alerts.push(msg);
      this.logger.warn(msg);
    }

    // Alert: high utilization — active > 80% of pool
    const utilizationThreshold = Math.floor(stats.poolSize * 0.8);
    if (stats.active > utilizationThreshold) {
      const msg =
        `POOL HIGH UTILIZATION: ${stats.active}/${stats.poolSize} active ` +
        `(threshold: ${utilizationThreshold})`;
      alerts.push(msg);
      this.logger.warn(msg);
    }

    // Track max active connections seen
    if (stats.active > this.maxActiveSeen) {
      this.maxActiveSeen = stats.active;
    }

    const snapshot: PoolSnapshot = {
      timestamp: new Date(),
      stats,
      alerts,
    };

    this.history.push(snapshot);

    // Keep only the last MAX_HISTORY snapshots
    if (this.history.length > PoolMonitorService.MAX_HISTORY) {
      this.history.shift();
    }
  }

  /**
   * Get the rolling history of pool snapshots (last 100).
   */
  getPoolHistory(): PoolSnapshot[] {
    return [...this.history];
  }

  /**
   * Get the current pool utilization percentage.
   */
  getUtilizationPercent(stats: PoolStats): number {
    return Math.round((stats.active / stats.poolSize) * 100 * 100) / 100;
  }

  /**
   * Get the high-water mark for active connections.
   */
  getMaxActiveSeen(): number {
    return this.maxActiveSeen;
  }

  /**
   * Reset the high-water mark (useful after config changes).
   */
  resetMaxActive(): void {
    this.maxActiveSeen = 0;
  }
}
