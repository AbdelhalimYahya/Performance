import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

/**
 * QUEUE MONITOR SERVICE
 *
 * Periodically checks all queue health and logs alerts.
 * Cron runs every 30 seconds to collect stats.
 *
 * Alert conditions (production thresholds):
 * - failedCount > 100: something is wrong with processors
 * - waitingCount > 1000: queue is backing up, consumers can't keep up
 *
 * Health status per queue:
 * - healthy: all clear
 * - degraded: waiting > 500 OR failed > 50
 * - critical: waiting > 1000 OR failed > 100
 */

interface QueueHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'critical';
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

@Injectable()
export class QueueMonitorService {
  private readonly logger = new Logger(QueueMonitorService.name);

  constructor(
    @InjectQueue('emails') private emailQueue: Queue,
    @InjectQueue('reports') private reportQueue: Queue,
    @InjectQueue('image-processing') private imageQueue: Queue,
    @InjectQueue('notifications') private notificationQueue: Queue,
    @InjectQueue('cleanup') private cleanupQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async collectStats() {
    const queues = [
      { name: 'emails', queue: this.emailQueue },
      { name: 'reports', queue: this.reportQueue },
      { name: 'image-processing', queue: this.imageQueue },
      { name: 'notifications', queue: this.notificationQueue },
      { name: 'cleanup', queue: this.cleanupQueue },
    ];

    const stats: Record<string, { waiting: number; active: number; failed: number }> = {};

    for (const { name, queue } of queues) {
      const [waiting, active, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getFailedCount(),
      ]);

      stats[name] = { waiting, active, failed };

      // Alert: too many failures
      if (failed > 100) {
        this.logger.error(
          `CRITICAL: Queue "${name}" has ${failed} failed jobs — check processor logs`,
        );
      } else if (failed > 50) {
        this.logger.warn(`WARNING: Queue "${name}" has ${failed} failed jobs`);
      }

      // Alert: queue backing up
      if (waiting > 1000) {
        this.logger.error(
          `CRITICAL: Queue "${name}" has ${waiting} waiting jobs — consumers can't keep up`,
        );
      } else if (waiting > 500) {
        this.logger.warn(`WARNING: Queue "${name}" has ${waiting} waiting jobs`);
      }
    }

    this.logger.log(
      `Queue stats: ${Object.entries(stats)
        .map(([name, s]) => `${name}(${s.waiting}w/${s.active}a/${s.failed}f)`)
        .join(' | ')}`,
    );
  }

  /**
   * Get health status for all queues.
   * Used by health check endpoint.
   */
  async getQueueHealth(): Promise<{ queues: QueueHealth[] }> {
    const queues = [
      { name: 'emails', queue: this.emailQueue },
      { name: 'reports', queue: this.reportQueue },
      { name: 'image-processing', queue: this.imageQueue },
      { name: 'notifications', queue: this.notificationQueue },
      { name: 'cleanup', queue: this.cleanupQueue },
    ];

    const health: QueueHealth[] = [];

    for (const { name, queue } of queues) {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
      if (waiting > 1000 || failed > 100) {
        status = 'critical';
      } else if (waiting > 500 || failed > 50) {
        status = 'degraded';
      }

      health.push({ name, status, waiting, active, completed, failed, delayed });
    }

    return { queues: health };
  }
}
