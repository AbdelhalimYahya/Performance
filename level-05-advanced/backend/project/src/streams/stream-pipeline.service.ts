import { Injectable, Logger } from '@nestjs/common';
import { pipeline } from 'stream/promises';
import { createReadStream } from 'fs';
import * as fs from 'fs';
import { CsvParserTransform } from './transforms/csv-parser.transform';
import { DataValidatorTransform, DEFAULT_CSV_SCHEMA } from './transforms/data-validator.transform';
import { DbInserterWritable } from './transforms/db-inserter.writable';

/**
 * STREAM PIPELINE SERVICE
 *
 * Demonstrates the power of Node.js streams for processing large files.
 *
 * Key insight: streams process data chunk-by-chunk without loading
 * the entire file into memory. A 1GB CSV file uses ~5MB of memory
 * with streaming, vs 1GB+ with fs.readFile().
 *
 * stream.promises.pipeline() connects streams in sequence:
 *   readStream → csvParser → validator → dbInserter
 *
 * Benefits of pipeline():
 * - Automatic error propagation: if any stream errors, all are destroyed
 * - Automatic cleanup: all streams are closed/destroyed on completion
 * - Back-pressure propagation: dbInserter pauses → validator pauses → parser pauses → readStream pauses
 * - Promise-based: returns a Promise that resolves on completion
 */

export interface PipelineResult {
  rowsProcessed: number;
  rowsErrored: number;
  duration: number;
  peakMemoryMb: number;
  avgThroughputRowsPerSec: number;
}

@Injectable()
export class StreamPipelineService {
  private readonly logger = new Logger(StreamPipelineService.name);

  /**
   * Process a large CSV file using streams.
   *
   * Flow:
   * 1. createReadStream reads file in 64KB chunks (default highWaterMark)
   * 2. CsvParserTransform parses CSV rows, handles chunk boundaries
   * 3. DataValidatorTransform validates each row against schema
   * 4. DbInserterWritable batches rows (500) and inserts into DB
   *
   * Memory monitoring: checks process.memoryUsage() every second.
   * For a 1GB file, peak memory should stay under 10MB.
   */
  async processLargeCSV(filePath: string): Promise<PipelineResult> {
    const start = performance.now();
    let peakMemoryMb = 0;

    // Monitor memory every second
    const memInterval = setInterval(() => {
      const mem = process.memoryUsage();
      const heapMb = mem.heapUsed / 1024 / 1024;
      if (heapMb > peakMemoryMb) peakMemoryMb = heapMb;
    }, 1000);

    // Create stream instances
    const readStream = createReadStream(filePath, { highWaterMark: 64 * 1024 }); // 64KB chunks
    const csvParser = new CsvParserTransform(',');
    const validator = new DataValidatorTransform(DEFAULT_CSV_SCHEMA);
    const inserter = new DbInserterWritable(async (rows) => {
      // Simulate DB insert — in production: use pg.Client or Prisma
      await new Promise((resolve) => setTimeout(resolve, 10));
      this.logger.debug(`Inserted batch of ${rows.length} rows`);
    }, { batchSize: 500 });

    // Track invalid rows
    let rowsErrored = 0;
    validator.on('invalidRow', () => { rowsErrored++; });

    // Connect the pipeline
    await pipeline(readStream, csvParser, validator, inserter);

    clearInterval(memInterval);

    const duration = performance.now() - start;
    const stats = inserter.getStats();

    this.logger.log(
      `Pipeline complete: ${stats.totalInserted} rows in ${(duration / 1000).toFixed(1)}s, ` +
      `peak memory: ${peakMemoryMb.toFixed(1)}MB, ` +
      `${stats.batchCount} batches, ${stats.failedBatches} failed`,
    );

    return {
      rowsProcessed: csvParser.rowsProcessed,
      rowsErrored,
      duration,
      peakMemoryMb,
      avgThroughputRowsPerSec: csvParser.rowsProcessed / (duration / 1000),
    };
  }

  /**
   * NAIVE APPROACH: read entire file into memory.
   *
   * For comparison only — demonstrates why streaming is necessary.
   * A 1GB file will consume 1GB+ of heap memory and likely cause OOM.
   */
  async processLargeCSVNaive(filePath: string): Promise<PipelineResult> {
    const start = performance.now();
    let peakMemoryMb = 0;

    const memInterval = setInterval(() => {
      const mem = process.memoryUsage();
      const heapMb = mem.heapUsed / 1024 / 1024;
      if (heapMb > peakMemoryMb) peakMemoryMb = heapMb;
    }, 1000);

    // Read ENTIRE file into memory — bad for large files!
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    let rowsProcessed = 0;
    let rowsErrored = 0;
    const allRows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const [id, name, email, amount, category, date] = line.split(',');
      const row = { id, name, email, amount, category, date };

      // Simple validation
      if (!name || !email || isNaN(Number(amount))) {
        rowsErrored++;
        continue;
      }

      allRows.push(row);
      rowsProcessed++;
    }

    // Insert all at once — no batching
    await new Promise((resolve) => setTimeout(resolve, allRows.length * 0.01));

    clearInterval(memInterval);

    const duration = performance.now() - start;

    this.logger.warn(
      `Naive approach: ${rowsProcessed} rows in ${(duration / 1000).toFixed(1)}s, ` +
      `peak memory: ${peakMemoryMb.toFixed(1)}MB (HIGH!)`,
    );

    return {
      rowsProcessed,
      rowsErrored,
      duration,
      peakMemoryMb,
      avgThroughputRowsPerSec: rowsProcessed / (duration / 1000),
    };
  }
}
