import {
  Controller, Get, Res, Query, HttpCode, HttpStatus
} from '@nestjs/common';
import { Response } from 'express';
import { StreamingService } from './streaming.service';

@Controller('streaming')
export class StreamingController {
  constructor(private readonly streamingService: StreamingService) {}

  // ---------------------------------------------------------------------------
  // GET /streaming/buffered — Traditional buffered response
  // Loads all records into memory, serializes once, sends as single chunk
  // ---------------------------------------------------------------------------
  @Get('buffered')
  async buffered(
    @Res() res: Response,
    @Query('count') countQuery?: string
  ) {
    const count = Math.min(parseInt(countQuery || '10000', 10), 100_000);
    const start = performance.now();

    const records = this.streamingService.generateRecords(count);
    const serialized = JSON.stringify(records);

    res.setHeader('X-Strategy', 'buffered');
    res.setHeader('X-Record-Count', count.toString());
    res.setHeader('X-Compression', 'none');
    res.setHeader('Content-Type', 'application/json');
    res.send(serialized);

    const duration = performance.now() - start;
    res.setHeader('X-Duration', duration.toFixed(2));
  }

  // ---------------------------------------------------------------------------
  // GET /streaming/streamed — NDJSON streaming
  // Sends records one-by-one as newline-delimited JSON
  // ---------------------------------------------------------------------------
  @Get('streamed')
  async streamed(
    @Res() res: Response,
    @Query('count') countQuery?: string
  ) {
    const count = Math.min(parseInt(countQuery || '10000', 10), 100_000);
    const start = performance.now();

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Strategy', 'streamed');
    res.setHeader('X-Record-Count', count.toString());
    res.setHeader('X-Compression', 'none');

    await this.streamingService.streamRecords(res, count);
    res.end();

    const duration = performance.now() - start;
    res.setHeader('X-Duration', duration.toFixed(2));
  }

  // ---------------------------------------------------------------------------
  // GET /streaming/chunked — Chunked response with artificial delay
  // Sends 10 chunks of 1,000 records with 50ms delay between chunks
  // ---------------------------------------------------------------------------
  @Get('chunked')
  async chunked(
    @Res() res: Response,
    @Query('count') countQuery?: string
  ) {
    const count = Math.min(parseInt(countQuery || '10000', 10), 100_000);
    const start = performance.now();
    const CHUNK_SIZE = 1000;
    const DELAY_MS = 50;

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Strategy', 'chunked');
    res.setHeader('X-Record-Count', count.toString());
    res.setHeader('X-Compression', 'none');

    const records = this.streamingService.generateRecords(count);

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const ndjson = chunk.map((r) => JSON.stringify(r)).join('\n') + '\n';
      res.write(ndjson);

      // Artificial delay to simulate slow processing or network pacing
      if (i + CHUNK_SIZE < records.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }

    res.end();
    const duration = performance.now() - start;
    res.setHeader('X-Duration', duration.toFixed(2));
  }

  // ---------------------------------------------------------------------------
  // GET /streaming/compressed — Buffered with Gzip compression
  // Compresses the serialized JSON before sending
  // ---------------------------------------------------------------------------
  @Get('compressed')
  async compressed(
    @Res() res: Response,
    @Query('count') countQuery?: string
  ) {
    const count = Math.min(parseInt(countQuery || '10000', 10), 100_000);
    const start = performance.now();

    const records = this.streamingService.generateRecords(count);
    const serialized = JSON.stringify(records);

    // Lazy-import zlib to avoid loading it when not needed
    const zlib = await import('zlib');
    const compressed = zlib.gzipSync(Buffer.from(serialized));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('X-Strategy', 'compressed');
    res.setHeader('X-Record-Count', count.toString());
    res.setHeader('X-Compression', 'gzip');
    res.send(compressed);

    const duration = performance.now() - start;
    res.setHeader('X-Duration', duration.toFixed(2));
  }

  // ---------------------------------------------------------------------------
  // GET /streaming/compare — Benchmark summary
  // Returns timing metadata comparing all four strategies
  // ---------------------------------------------------------------------------
  @Get('compare')
  async compare(@Res() res: Response) {
    const count = parseInt('10000', 10);
    const results = await Promise.all([
      this.streamingService.measureStrategy('buffered', count),
      this.streamingService.measureStrategy('streamed', count),
      this.streamingService.measureStrategy('chunked', count),
      this.streamingService.measureStrategy('compressed', count),
    ]);

    res.setHeader('X-Strategy', 'compare');
    res.setHeader('Content-Type', 'application/json');
    res.json({
      recordCount: count,
      strategies: results,
      fastest: results.reduce((a, b) =>
        a.durationMs < b.durationMs ? a : b
      ).strategy,
    });
  }

  // ---------------------------------------------------------------------------
  // GET /streaming/serialize — Serialization benchmark
  // Compares JSON.stringify vs fast-json-stringify vs manual concat
  // ---------------------------------------------------------------------------
  @Get('serialize')
  async serialize(@Res() res: Response) {
    const comparison = this.streamingService.serializationBenchmark();

    res.setHeader('X-Strategy', 'serialize-compare');
    res.setHeader('Content-Type', 'application/json');
    res.json({
      recordCount: 1000,
      iterations: 100,
      results: comparison,
    });
  }

  // ---------------------------------------------------------------------------
  // GET /streaming/full — Full benchmark run (multiple iterations)
  // ---------------------------------------------------------------------------
  @Get('full')
  async full(@Res() res: Response) {
    const summary = await this.streamingService.getBenchmarkSummary(3);

    res.setHeader('X-Strategy', 'full-benchmark');
    res.setHeader('Content-Type', 'application/json');
    res.json(summary);
  }
}
