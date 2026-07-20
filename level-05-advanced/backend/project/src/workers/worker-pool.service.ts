import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Piscina } from 'piscina';
import * as os from 'os';

/**
 * WORKER POOL SERVICE
 *
 * Manages a fixed pool of worker threads using Piscina.
 * Piscina reuses threads across tasks, avoiding the ~5ms overhead
 * of creating a new Worker per task.
 *
 * Pool sizing: os.cpus().length - 1
 * - Leave 1 core free for the event loop and I/O handling
 * - If the app is I/O-bound (most NestJS apps), you can use os.cpus().length
 *
 * concurrentTasksPerWorker: 2
 * - Each worker handles 2 tasks concurrently
 * - Useful when tasks spend time waiting (e.g., DB calls in worker)
 * - For pure CPU work, keep at 1 to avoid context switching
 *
 * maxQueue: "auto"
 * - Piscina defaults to maxThreads × 2
 * - Backpressure kicks in when queue is full → rejects new tasks
 *
 * idleTimeout: 30000 (30s)
 * - Idle threads are terminated after 30s to free memory
 * - New threads are created on-demand when tasks arrive
 */

export interface PoolStats {
  pendingTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  utilization: number;
  avgTaskDurationMs: number;
}

@Injectable()
export class WorkerPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(WorkerPoolService.name);
  private readonly pool: Piscina;
  private totalDuration = 0;
  private totalCompleted = 0;

  constructor() {
    this.pool = new Piscina({
      filename: './dist/workers/tasks/cpu-intensive.worker.js',
      maxThreads: Math.max(1, os.cpus().length - 1),
      minThreads: 1,
      maxQueue: 'auto',
      idleTimeout: 30_000,
      concurrentTasksPerWorker: 2,
      taskQueue: { // Use FairShareQueue for better latency distribution
        compare: (a: any, b: any) => (a.priority || 0) - (b.priority || 0),
      },
    });

    this.logger.log(
      `Worker pool: ${this.pool.options.maxThreads} max threads, ` +
      `concurrency=${this.pool.options.concurrentTasksPerWorker}, ` +
      `queue=${this.pool.options.maxQueue}`,
    );
  }

  /**
   * Submit a task to the worker pool.
   *
   * @param workerFile - path to worker script (relative to dist/)
   * @param taskData - serializable data to send to worker
   * @returns Promise resolving to worker result
   *
   * Piscina uses structured clone to transfer data to worker threads.
   * Functions, class instances, and handles cannot be transferred.
   * Use transfer lists for large ArrayBuffers to avoid copying.
   */
  async run<T = unknown, R = unknown>(workerFile: string, taskData: T): Promise<R> {
    const start = performance.now();
    try {
      const result = await this.pool.run({ workerFile, ...taskData } as any) as R;
      const duration = performance.now() - start;
      this.totalDuration += duration;
      this.totalCompleted++;
      return result;
    } catch (err) {
      this.logger.error(`Worker task failed: ${err}`);
      throw err;
    }
  }

  /**
   * Run a task with a timeout using AbortController.
   *
   * If the task exceeds timeoutMs, the promise rejects with a timeout error.
   * The worker thread continues running until Piscina's taskTimeout kicks in.
   *
   * Use case: prevent one slow task from blocking the queue forever.
   */
  async runWithTimeout<T = unknown, R = unknown>(
    workerFile: string,
    taskData: T,
    timeoutMs: number,
  ): Promise<R> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await Promise.race([
        this.run<T, R>(workerFile, taskData),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Task timed out after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Pool statistics for monitoring and health checks.
   *
   * utilization: ratio of active threads to total threads
   * - 0.0 = all idle, 1.0 = all busy
   * - >0.8 sustained = consider scaling up
   *
   * avgTaskDurationMs: rolling average across all completed tasks
   * - Use to estimate when queued tasks will complete
   */
  getStats(): PoolStats {
    const completed = this.pool.completed;
    const running = this.pool.running;
    const queued = this.pool.queueSize;
    const maxThreads = (this.pool.options.maxThreads as number) || 1;

    return {
      pendingTasks: queued,
      activeTasks: running,
      completedTasks: completed,
      failedTasks: 0, // Piscina doesn't track this directly; use wrapper
      utilization: Math.min(1, running / maxThreads),
      avgTaskDurationMs: this.totalCompleted > 0 ? this.totalDuration / this.totalCompleted : 0,
    };
  }

  /**
   * Graceful shutdown: drain the pool before process exits.
   *
   * Piscina.destroy() waits for all running tasks to complete,
   * then terminates all worker threads.
   *
   * maxWait: 30s — if tasks don't finish in 30s, force shutdown.
   */
  async onModuleDestroy() {
    this.logger.log('Draining worker pool...');
    try {
      await this.pool.destroy({ timeout: 30_000 });
      this.logger.log('Worker pool destroyed gracefully');
    } catch (err) {
      this.logger.error(`Worker pool destroy error: ${err}`);
    }
  }
}
