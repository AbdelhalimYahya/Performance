import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Piscina } from 'piscina';
import * as os from 'os';

/**
 * TASK INPUT/RESULT INTERFACES
 *
 * Typed contract between main thread and worker thread.
 * Piscina serializes input via structured clone (no functions, no handles).
 * Result must also be serializable — return plain objects, not class instances.
 */
export interface TaskInput<T = unknown> {
  taskName: string;
  data: T;
}

export interface TaskResult<T = unknown> {
  data: T;
  durationMs: number;
  threadId: number;
}

@Injectable()
export class WorkerPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(WorkerPoolService.name);
  private readonly pool: Piscina;

  constructor() {
    /**
     * Pool configuration:
     * - filename: path to worker script (compiled JS, not TS)
     * - maxThreads: one less than CPU count to protect event loop
     * - maxQueue: backpressure limit — reject when queue exceeds this
     * - taskTimeout: 30s per task — prevents thread starvation
     * - idleTimeout: 5s — reclaim idle threads to free memory
     */
    this.pool = new Piscina({
      filename: './dist/worker-pool/worker-task.js',
      maxThreads: Math.max(1, os.cpus().length - 1),
      maxQueue: 100,
      taskTimeout: 30_000,
      idleTimeout: 5_000,
    });

    this.logger.log(
      `Worker pool initialized: ${this.pool.options.maxThreads} threads, ` +
      `maxQueue=${this.pool.options.maxQueue}`,
    );
  }

  /**
   * Run a task in the worker pool.
   *
   * Piscina.schedule() queues the task if all threads are busy.
   * Returns a Promise that resolves when the worker completes.
   *
   * Throws if:
   * - Queue is full (maxQueue exceeded)
   * - Task times out (taskTimeout exceeded)
   * - Worker crashes
   */
  async run<TInput, TOutput>(taskName: string, data: TInput): Promise<TaskResult<TOutput>> {
    const start = performance.now();
    try {
      const result = await this.pool.run({ taskName, data }) as TOutput;
      const durationMs = performance.now() - start;
      this.logger.log(`Task "${taskName}" completed in ${durationMs.toFixed(1)}ms`);
      return { data: result, durationMs, threadId: 0 };
    } catch (err) {
      const durationMs = performance.now() - start;
      this.logger.error(`Task "${taskName}" failed after ${durationMs.toFixed(1)}ms: ${err}`);
      throw err;
    }
  }

  /**
   * Run multiple tasks concurrently.
   * Piscina distributes them across available threads automatically.
   */
  async runBatch<TInput, TOutput>(
    taskName: string,
    items: TInput[],
  ): Promise<TaskResult<TOutput>[]> {
    return Promise.all(items.map((item) => this.run<TInput, TOutput>(taskName, item)));
  }

  /**
   * Pool stats for monitoring.
   * Use in health checks and metrics endpoints.
   */
  getStats() {
    return {
      completed: this.pool.completed,
      running: this.pool.running,
      queueSize: this.pool.queueSize,
      maxThreads: this.pool.options.maxThreads,
    };
  }

  async onModuleDestroy() {
    await this.pool.destroy();
    this.logger.log('Worker pool destroyed');
  }
}
