import { Module } from '@nestjs/common';
import { WorkerPoolService } from './worker-pool.service';
import { WorkersController } from './workers.controller';

/**
 * WORKERS MODULE
 *
 * Provides CPU-bound task offloading via worker threads.
 * Import this module in AppModule to enable /workers/* endpoints.
 *
 * Usage in other services:
 *   constructor(private readonly workerPool: WorkerPoolService) {}
 *   await this.workerPool.run('sortLargeArray', { array: data });
 *
 * The pool is shared across the application — one pool per process.
 * Don't create multiple Piscina instances; it wastes memory on thread stacks.
 */
@Module({
  controllers: [WorkersController],
  providers: [WorkerPoolService],
  exports: [WorkerPoolService],
})
export class WorkersModule {}
