import { Controller, Get, Post } from '@nestjs/common';
import { ClusterStatsService } from './cluster-stats.service';

/**
 * CLUSTER CONTROLLER
 *
 * Endpoints for monitoring and testing the cluster:
 * - GET /cluster/stats — aggregated cluster health
 * - GET /cluster/worker — THIS worker's info (proves round-robin)
 * - POST /cluster/worker/kill-self — kills current worker to test auto-restart
 *
 * Round-robin test: call GET /cluster/worker multiple times.
 * On Linux, you'll see different PIDs — proves the OS distributes
 * connections evenly across workers.
 */
@Controller('cluster')
export class ClusterController {
  constructor(private readonly statsService: ClusterStatsService) {}

  /**
   * GET /cluster/stats
   * Returns aggregated cluster health summary.
   */
  @Get('stats')
  getStats() {
    const stats = this.statsService.getClusterStats();
    const unhealthy = this.statsService.detectUnhealthyWorkers();

    return {
      ...stats,
      unhealthyWorkers: unhealthy.map((w) => ({
        pid: w.pid,
        memoryMb: w.memoryMb,
        memoryPercent: ((w.memoryMb / 800) * 100).toFixed(1) + '%',
      })),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /cluster/worker
   * Returns THIS worker's PID and info.
   *
   * Call this endpoint multiple times — on Linux you'll see different PIDs
   * because the primary distributes connections round-robin across workers.
   * This proves the cluster is working.
   */
  @Get('worker')
  getWorkerInfo() {
    const pid = process.pid;
    const stats = this.statsService.getWorkerStats(pid);

    return {
      pid,
      ppid: process.ppid,
      uptime: process.uptime().toFixed(1) + 's',
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      requestCount: stats?.requestCount || 0,
      nodeVersion: process.version,
      platform: process.platform,
      note: 'Call this endpoint multiple times — different PIDs prove round-robin distribution',
    };
  }

  /**
   * POST /cluster/worker/kill-self
   * Kills the current worker process to test auto-restart behavior.
   *
   * The primary process detects the crash and forks a replacement
   * after a 1s delay. New requests will be served by the new worker.
   */
  @Post('worker/kill-self')
  killSelf() {
    const pid = process.pid;
    console.log(`Worker ${pid} killing itself for testing`);

    // Use setTimeout so the response can be sent before process dies
    setTimeout(() => process.exit(1), 100);

    return {
      message: `Worker ${pid} is shutting down. Primary will restart it.`,
      pid,
    };
  }
}
