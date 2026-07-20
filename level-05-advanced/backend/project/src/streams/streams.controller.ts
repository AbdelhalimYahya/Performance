import { Controller, Get, Post, Query, Res, Body } from '@nestjs/common';
import { StreamPipelineService } from './stream-pipeline.service';
import { generateTestCSV } from './generate-test-csv';
import { Response } from 'express';

/**
 * STREAMS CONTROLLER
 *
 * Demonstrates streaming patterns:
 * 1. Stream pipeline for large file processing (POST)
 * 2. Naive approach for comparison (POST)
 * 3. Side-by-side comparison of both approaches (GET)
 * 4. HTTP response streaming — no buffering (GET)
 * 5. NDJSON streaming for large JSON arrays (GET)
 */

@Controller('streams')
export class StreamsController {
  constructor(private readonly pipelineService: StreamPipelineService) {}

  /**
   * POST /streams/process-csv
   * Process a CSV file using the streaming pipeline.
   */
  @Post('process-csv')
  async processCsv(@Body() body: { filePath: string }) {
    return this.pipelineService.processLargeCSV(body.filePath);
  }

  /**
   * POST /streams/process-csv/naive
   * Process using the naive approach (full file in memory).
   */
  @Post('process-csv/naive')
  async processCsvNaive(@Body() body: { filePath: string }) {
    return this.pipelineService.processLargeCSVNaive(body.filePath);
  }

  /**
   * GET /streams/compare
   * Generates a 50MB test CSV, runs both approaches, returns comparison.
   * Shows the memory difference: streaming stays flat, naive spikes.
   */
  @Get('compare')
  async compare() {
    const filePath = '/tmp/compare-test.csv';
    const rows = 500_000; // ~50MB

    await generateTestCSV(filePath, rows);

    const streaming = await this.pipelineService.processLargeCSV(filePath);
    const naive = await this.pipelineService.processLargeCSVNaive(filePath);

    return {
      streaming: {
        peakMemoryMb: parseFloat(streaming.peakMemoryMb.toFixed(1)),
        durationMs: parseFloat(streaming.duration.toFixed(0)),
        rowsProcessed: streaming.rowsProcessed,
      },
      naive: {
        peakMemoryMb: parseFloat(naive.peakMemoryMb.toFixed(1)),
        durationMs: parseFloat(naive.duration.toFixed(0)),
        rowsProcessed: naive.rowsProcessed,
      },
      memoryDifference: `${(naive.peakMemoryMb / streaming.peakMemoryMb).toFixed(0)}x more memory with naive`,
    };
  }

  /**
   * GET /streams/generate-csv
   * Generates a CSV and streams it directly as the HTTP response.
   * Demonstrates HTTP response streaming: never buffers the entire file.
   */
  async generateCsv(
    @Query('rows') rowsStr: string,
    @Res() res: Response,
  ) {
    const rows = parseInt(rowsStr || '100000', 10);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="data-${rows}.csv"`);

    // Stream CSV directly to response — no buffering
    const { Readable } = await import('stream');
    let rowCount = 0;

    const readable = new Readable({
      read() {
        if (rowCount >= rows) {
          this.push(null); // End stream
          return;
        }

        const batchSize = Math.min(1000, rows - rowCount);
        let chunk = '';

        for (let i = 0; i < batchSize; i++) {
          const id = rowCount + i + 1;
          const name = `User ${id}`;
          const email = `user${id}@example.com`;
          const amount = (Math.random() * 1000).toFixed(2);
          const category = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
          const date = new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          chunk += `${id},${name},${email},${amount},${category},${date}\n`;
        }

        rowCount += batchSize;
        this.push(chunk);
      },
    });

    readable.pipe(res);
  }

  /**
   * GET /streams/large-json
   * Streams a large JSON array as NDJSON (newline-delimited JSON).
   * Each line is a complete JSON object. Client parses line-by-line.
   * Never builds the full array in memory.
   */
  async streamLargeJson(
    @Query('count') countStr: string,
    @Res() res: Response,
  ) {
    const count = parseInt(countStr || '100000', 10);

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    let sent = 0;
    const batchSize = 1000;

    const sendBatch = () => {
      if (sent >= count) {
        res.end();
        return;
      }

      const batchCount = Math.min(batchSize, count - sent);
      let chunk = '';

      for (let i = 0; i < batchCount; i++) {
        const id = sent + i + 1;
        const record = {
          id,
          name: `User ${id}`,
          email: `user${id}@example.com`,
          amount: Math.round(Math.random() * 100000) / 100,
          timestamp: new Date().toISOString(),
        };
        chunk += JSON.stringify(record) + '\n';
      }

      sent += batchCount;
      const canContinue = res.write(chunk);

      if (canContinue) {
        setImmediate(sendBatch);
      } else {
        res.once('drain', sendBatch);
      }
    };

    sendBatch();
  }
}
