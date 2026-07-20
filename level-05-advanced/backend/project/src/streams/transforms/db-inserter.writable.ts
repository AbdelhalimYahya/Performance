import { Writable, WritableOptions } from 'stream';

/**
 * DB INSERTER WRITABLE STREAM
 *
 * Terminal stream — receives validated rows and inserts into database.
 * Uses batching to reduce round-trips: accumulates rows, inserts 500 at a time.
 *
 * Back-pressure implementation:
 * - _write() accumulates row into batch array
 * - When batch is full (500 rows), calls async insert function
 * - callback() is called ONLY AFTER the insert completes
 * - This signals the upstream to pause until the insert finishes
 * - Without this, the stream would buffer thousands of rows in memory
 *
 * _final() flushes the last partial batch (may have <500 rows).
 *
 * In production: replace doInsert with a real DB client (pg, Prisma, etc.)
 * Use parameterized queries to prevent SQL injection.
 */

interface BatchRow {
  [key: string]: any;
}

export interface DbInserterStats {
  totalInserted: number;
  batchCount: number;
  failedBatches: number;
  avgBatchDurationMs: number;
}

export class DbInserterWritable extends Writable {
  private batch: BatchRow[] = [];
  private totalInserted = 0;
  private batchCount = 0;
  private failedBatches = 0;
  private totalBatchDurationMs = 0;
  private readonly batchSize: number;

  constructor(
    private readonly insertFn: (rows: BatchRow[]) => Promise<void>,
    options?: WritableOptions & { batchSize?: number },
  ) {
    super({ objectMode: true, ...options });
    this.batchSize = options?.batchSize || 500;
  }

  /**
   * _write: called for each row from the pipeline.
   *
   * Key back-pressure pattern:
   * 1. Accumulate row into batch
   * 2. If batch is NOT full → call callback() immediately (no blocking)
   * 3. If batch IS full → call insertFn, await completion, THEN call callback()
   * 4. The await in step 3 pauses the upstream — this IS back-pressure
   */
  async _write(row: BatchRow, encoding: string, callback: (error?: Error | null) => void): Promise<void> {
    this.batch.push(row);

    if (this.batch.length >= this.batchSize) {
      try {
        const start = performance.now();
        await this.insertFn([...this.batch]);
        this.totalBatchDurationMs += performance.now() - start;

        this.totalInserted += this.batch.length;
        this.batchCount++;
        this.batch = [];
        callback();
      } catch (err) {
        this.failedBatches++;
        this.batch = [];
        callback(err as Error);
      }
    } else {
      callback();
    }
  }

  /**
   * _final: called when the upstream ends.
   * Flushes the last partial batch (< batchSize rows).
   */
  async _final(callback: (error?: Error | null) => void): Promise<void> {
    if (this.batch.length > 0) {
      try {
        const start = performance.now();
        await this.insertFn([...this.batch]);
        this.totalBatchDurationMs += performance.now() - start;

        this.totalInserted += this.batch.length;
        this.batchCount++;
        this.batch = [];
      } catch (err) {
        this.failedBatches++;
        callback(err as Error);
        return;
      }
    }
    callback();
  }

  getStats(): DbInserterStats {
    return {
      totalInserted: this.totalInserted,
      batchCount: this.batchCount,
      failedBatches: this.failedBatches,
      avgBatchDurationMs: this.batchCount > 0 ? this.totalBatchDurationMs / this.batchCount : 0,
    };
  }
}
