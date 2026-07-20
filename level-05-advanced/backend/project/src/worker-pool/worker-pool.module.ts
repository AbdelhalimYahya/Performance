import { Module } from '@nestjs/common';
import { WorkerPoolService } from './worker-pool.service';
import { WorkerPoolController } from './worker-pool.controller';

/**
 * WORKER POOL MODULE
 *
 * Piscina manages a fixed pool of worker threads. Tasks are queued when all
 * threads are busy (up to maxQueue limit). Threads are reused across tasks,
 * avoiding the ~5ms overhead of creating a new Worker per task.
 *
 * Pool sizing: maxThreads = os.cpus().length - 1
 * - Leave 1 core for the event loop (handle I/O, timers, cluster management)
 * - For I/O-heavy workloads: maxThreads = os.cpus().length (no CPU-bound work)
 *
 * Backpressure: maxQueue = 100
 * - When queue is full, new tasks are rejected immediately
 * - Prevents unbounded memory growth from queued tasks
 *
 * Timeout: taskTimeout = 30000 (30s)
 * - AbortController cancels stuck tasks
 * - Prevents thread starvation from hung computations
 */
@Module({
  providers: [WorkerPoolService],
  controllers: [WorkerPoolController],
  exports: [WorkerPoolService],
})
export class WorkerPoolModule {}
