import { Injectable, Logger } from '@nestjs/common';
import * as os from 'os';

/**
 * CLUSTER STATS SERVICE
 *
 * Collects heartbeat data from all workers via IPC messages.
 * The primary process aggregates stats; workers call this to report.
 *
 * In a real multi-process setup:
 * - Primary stores stats in memory (this Map)
 * - Workers send heartbeats via process.send()
 * - Primary broadcasts aggregated stats back if needed
 */

interface WorkerHeartbeat {
  pid: number;
  uptime: number;
  memoryMb: number;
  requestCount: number;
  timestamp: number;
}

interface WorkerStats {
  pid: number;
  uptime: number;
  memoryMb: number;
  requestCount: number;
  lastSeen: number;
  healthy: boolean;
}

export interface ClusterStats {
  totalWorkers: number;
  healthyWorkers: number;
  totalRequests: number;
  avgResponseTimeMs: number;
  totalMemoryMb: number;
  cpuCores: number;
}

@Injectable()
export class ClusterStatsService {
  private readonly logger = new Logger(ClusterStatsService.name);
  private readonly workers = new Map<number, WorkerStats>();
  private readonly HEARTBEAT_TIMEOUT_MS = 15_000; // Mark unhealthy if no heartbeat in 15s
  private readonly MEMORY_LIMIT_MB = 800; // 80% of 1GB default heap

  /**
   * Record a heartbeat from a worker.
   * Called by the primary process when it receives an IPC message.
   */
  recordHeartbeat(data: WorkerHeartbeat) {
    const healthy = data.memoryMb < this.MEMORY_LIMIT_MB;
    this.workers.set(data.pid, {
      pid: data.pid,
      uptime: data.uptime,
      memoryMb: data.memoryMb,
      requestCount: data.requestCount,
      lastSeen: Date.now(),
      healthy,
    });
  }

  /**
   * Remove a worker from tracking (on exit).
   */
  removeWorker(pid: number) {
    this.workers.delete(pid);
  }

  /**
   * Get aggregated cluster statistics.
   */
  getClusterStats(): ClusterStats {
    const workerList = Array.from(this.workers.values());
    const totalRequests = workerList.reduce((sum, w) => sum + w.requestCount, 0);
    const totalMemory = workerList.reduce((sum, w) => sum + w.memoryMb, 0);
    const healthy = workerList.filter((w) => w.healthy).length;

    return {
      totalWorkers: workerList.length,
      healthyWorkers: healthy,
      totalRequests,
      avgResponseTimeMs: 0, // Would need response time tracking per worker
      totalMemoryMb: totalMemory,
      cpuCores: os.cpus().length,
    };
  }

  /**
   * Get individual worker stats.
   */
  getWorkerStats(pid: number): WorkerStats | undefined {
    return this.workers.get(pid);
  }

  /**
   * Get all workers as an array.
   */
  getAllWorkers(): WorkerStats[] {
    return Array.from(this.workers.values());
  }

  /**
   * Detect unhealthy workers: memory > 80% of heap limit.
   */
  detectUnhealthyWorkers(): WorkerStats[] {
    return Array.from(this.workers.values()).filter((w) => !w.healthy);
  }

  /**
   * Check if a worker's heartbeat is stale.
   */
  isHeartbeatStale(pid: number): boolean {
    const worker = this.workers.get(pid);
    if (!worker) return true;
    return Date.now() - worker.lastSeen > this.HEARTBEAT_TIMEOUT_MS;
  }
}
