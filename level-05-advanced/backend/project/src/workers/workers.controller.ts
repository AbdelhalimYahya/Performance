import { Controller, Post, Get, Body } from '@nestjs/common';
import { WorkerPoolService } from './worker-pool.service';
import { threadId } from 'worker_threads';

/**
 * WORKERS CONTROLLER
 *
 * Exposes worker thread tasks via HTTP endpoints.
 * The /compare endpoint is particularly useful: it runs the same task
 * on both main thread and worker thread simultaneously, showing the
 * event loop blocking impact on the main thread.
 */

function generateSortData(count: number): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * count * 10));
}

function generateRecords(count: number): Array<{ category: string; value: number }> {
  const categories = ['electronics', 'clothing', 'food', 'books', 'sports'];
  return Array.from({ length: count }, () => ({
    category: categories[Math.floor(Math.random() * categories.length)],
    value: Math.round(Math.random() * 1000 * 100) / 100,
  }));
}

function generateCSV(rows: number): string {
  const lines: string[] = [];
  for (let i = 0; i < rows; i++) {
    const name = `product_${i}`;
    const value = (Math.random() * 100).toFixed(2);
    lines.push(`${i + 1},${name},${value}`);
  }
  return lines.join('\n');
}

@Controller('workers')
export class WorkersController {
  constructor(private readonly workerPool: WorkerPoolService) {}

  /**
   * POST /workers/sort
   * Sends 1M item array to worker thread.
   * Main thread event loop remains unblocked during sort.
   */
  @Post('sort')
  async sort() {
    const array = generateSortData(1_000_000);
    const result = await this.workerPool.run<
      { array: number[] },
      { result: number[]; executionMs: number; workerThreadId: number }
    >('sortLargeArray', { array });

    return {
      inputSize: array.length,
      sorted: result.result.slice(0, 10), // First 10 for preview
      executionMs: result.executionMs.toFixed(2),
      workerThreadId: result.workerThreadId,
      mainThreadId: threadId,
    };
  }

  /**
   * POST /workers/hash
   * Sends password to worker for bcrypt hashing.
   * Demonstrates why bcrypt MUST run in worker — intentionally slow.
   */
  @Post('hash')
  async hash(@Body() body: { password: string; rounds?: number }) {
    const result = await this.workerPool.run<
      { password: string; rounds?: number },
      { result: string; executionMs: number; workerThreadId: number }
    >('hashPassword', { password: body.password || 'test123', rounds: body.rounds });

    return {
      hash: result.result.slice(0, 20) + '...',
      executionMs: result.executionMs.toFixed(2),
      workerThreadId: result.workerThreadId,
    };
  }

  /**
   * POST /workers/report
   * Sends 10K records to worker for aggregation.
   * Business logic that would block event loop if run on main thread.
   */
  @Post('report')
  async report() {
    const records = generateRecords(10_000);
    const result = await this.workerPool.run<
      { records: Array<{ category: string; value: number }> },
      { result: Record<string, any>; executionMs: number; workerThreadId: number }
    >('generateReport', { records });

    return {
      categories: Object.keys(result.result).length,
      stats: result.result,
      executionMs: result.executionMs.toFixed(2),
      workerThreadId: result.workerThreadId,
    };
  }

  /**
   * GET /workers/compare
   * Runs the sort task on BOTH main thread and worker thread.
   * Shows the event loop blocking impact:
   * - Main thread: blocks event loop, other requests queue
   * - Worker thread: event loop stays free, other requests served
   */
  @Get('compare')
  async compare() {
    const array = generateSortData(1_000_000);

    // Run on worker thread (non-blocking)
    const workerPromise = this.workerPool.run<
      { array: number[] },
      { result: number[]; executionMs: number; workerThreadId: number }
    >('sortLargeArray', { array });

    // Run on main thread (blocking)
    const mainStart = performance.now();
    const sorted = [...array].sort((a, b) => a - b);
    const mainDuration = performance.now() - mainStart;

    const workerResult = await workerPromise;

    return {
      inputSize: array.length,
      mainThread: {
        durationMs: parseFloat(mainDuration.toFixed(2)),
        eventLoopBlocked: true,
        threadId,
      },
      workerThread: {
        durationMs: parseFloat(workerResult.executionMs.toFixed(2)),
        eventLoopBlocked: false,
        threadId: workerResult.workerThreadId,
      },
      speedup: `${(mainDuration / workerResult.executionMs).toFixed(1)}x`,
      note: 'Main thread blocks event loop — no other HTTP requests can be served during sort',
    };
  }

  /**
   * GET /workers/stats
   * Current pool statistics for monitoring.
   */
  @Get('stats')
  stats() {
    return this.workerPool.getStats();
  }

  /**
   * GET /workers/stress
   * Fires 50 concurrent tasks to demonstrate pool queuing.
   * Shows how Piscina handles backpressure: queues excess tasks,
   * processes them as threads become available, never crashes.
   */
  @Get('stress')
  async stress() {
    const start = performance.now();
    const count = 50;

    const tasks = Array.from({ length: count }, (_, i) =>
      this.workerPool.run<
        { array: number[] },
        { result: number[]; executionMs: number; workerThreadId: number }
      >('sortLargeArray', { array: generateSortData(10_000) }).catch((err) => ({
        error: (err as Error).message,
        taskIndex: i,
      })),
    );

    const results = await Promise.all(tasks);
    const totalDuration = performance.now() - start;

    const successful = results.filter((r: any) => !r.error).length;
    const failed = results.filter((r: any) => r.error).length;

    return {
      totalTasks: count,
      successful,
      failed,
      totalDurationMs: parseFloat(totalDuration.toFixed(2)),
      avgTaskDurationMs: parseFloat((results.reduce((s: number, r: any) => s + (r.executionMs || 0), 0) / successful).toFixed(2)),
      poolStats: this.workerPool.getStats(),
    };
  }
}
