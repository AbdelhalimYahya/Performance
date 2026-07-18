import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import fastJson from 'fast-json-stringify';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

interface OrderRecord {
  id: string;
  userId: number;
  product: string;
  quantity: number;
  price: number;
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
}

interface StrategyResult {
  strategy: string;
  durationMs: number;
  memoryPeakMB: number;
  bytesWritten: number;
  recordCount: number;
}

interface BenchmarkSummary {
  strategies: StrategyResult[];
  serializationComparison: SerializationComparison;
  runs: number;
}

interface SerializationComparison {
  jsonStringify: { durationMs: number; opsPerSec: number };
  fastJsonStringify: { durationMs: number; opsPerSec: number };
  manualConcat: { durationMs: number; opsPerSec: number };
}

// ============================================================================
// Fast JSON Stringify Schema
// ============================================================================

const orderStringify = fastJson({
  type: 'object',
  properties: {
    id: { type: 'string' },
    userId: { type: 'integer' },
    product: { type: 'string' },
    quantity: { type: 'integer' },
    price: { type: 'number' },
    status: { type: 'string' },
    createdAt: { type: 'string' },
  },
});

const orderListStringify = fastJson({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      userId: { type: 'integer' },
      product: { type: 'string' },
      quantity: { type: 'integer' },
      price: { type: 'number' },
      status: { type: 'string' },
      createdAt: { type: 'string' },
    },
  },
});

// ============================================================================
// Data Generation
// ============================================================================

const PRODUCTS = [
  'Wireless Headphones', 'Smart Watch', 'USB-C Hub', 'Mechanical Keyboard',
  'LED Desk Lamp', 'Standing Desk', 'Monitor Stand', 'Webcam HD',
  'Portable Charger', 'Bluetooth Speaker', 'Fitness Tracker', 'Smart Plug',
  'Air Purifier', 'Coffee Maker', 'Robot Vacuum', 'Air Fryer',
];

const STATUSES: OrderRecord['status'][] = ['pending', 'shipped', 'delivered', 'cancelled'];

function generateRecords(count: number): OrderRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    userId: (i % 500) + 1,
    product: PRODUCTS[i % PRODUCTS.length],
    quantity: (i % 10) + 1,
    price: Math.round((Math.random() * 500 + 9.99) * 100) / 100,
    status: STATUSES[i % STATUSES.length],
    createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

// ============================================================================
// Streaming Service
// ============================================================================

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);

  /**
   * Generates fake order records.
   */
  generateRecords(count: number): OrderRecord[] {
    return generateRecords(count);
  }

  /**
   * Streams records to the response as NDJSON (newline-delimited JSON).
   * Each record is written as a separate JSON line.
   */
  async streamRecords(res: Response, count: number): Promise<void> {
    const records = generateRecords(count);
    for (const record of records) {
      res.write(JSON.stringify(record) + '\n');
    }
  }

  /**
   * Measures a specific streaming strategy and returns timing metrics.
   */
  async measureStrategy(
    strategy: string,
    count: number
  ): Promise<StrategyResult> {
    const memBefore = process.memoryUsage().heapUsed;
    let peakMem = memBefore;
    let bytesWritten = 0;

    const monitor = setInterval(() => {
      const current = process.memoryUsage().heapUsed;
      if (current > peakMem) peakMem = current;
    }, 10);

    const start = performance.now();

    const records = generateRecords(count);

    switch (strategy) {
      case 'buffered': {
        const serialized = JSON.stringify(records);
        bytesWritten = Buffer.byteLength(serialized);
        break;
      }
      case 'streamed': {
        const lines: string[] = [];
        for (const record of records) {
          lines.push(JSON.stringify(record));
        }
        const output = lines.join('\n');
        bytesWritten = Buffer.byteLength(output);
        break;
      }
      case 'chunked': {
        const CHUNK_SIZE = 1000;
        let output = '';
        for (let i = 0; i < records.length; i += CHUNK_SIZE) {
          const chunk = records.slice(i, i + CHUNK_SIZE);
          output += JSON.stringify(chunk) + '\n';
          if (i + CHUNK_SIZE < records.length) {
            await new Promise((r) => setTimeout(r, 50));
          }
        }
        bytesWritten = Buffer.byteLength(output);
        break;
      }
      case 'compressed': {
        const { gzipSync } = require('zlib');
        const serialized = JSON.stringify(records);
        const compressed = gzipSync(Buffer.from(serialized));
        bytesWritten = compressed.length;
        break;
      }
    }

    const durationMs = performance.now() - start;
    clearInterval(monitor);

    const memAfter = process.memoryUsage().heapUsed;
    const memPeakMB = Math.max((peakMem - memBefore) / 1048576, (memAfter - memBefore) / 1048576);

    return {
      strategy,
      durationMs: parseFloat(durationMs.toFixed(2)),
      memoryPeakMB: parseFloat(memPeakMB.toFixed(2)),
      bytesWritten,
      recordCount: count,
    };
  }

  /**
   * Compares serialization methods: JSON.stringify vs fast-json-stringify vs manual concat.
   */
  serializationBenchmark(): SerializationComparison {
    const records = generateRecords(1000);
    const iterations = 100;

    // JSON.stringify
    const start1 = performance.now();
    for (let i = 0; i < iterations; i++) {
      JSON.stringify(records);
    }
    const jsonDuration = performance.now() - start1;

    // fast-json-stringify
    const start2 = performance.now();
    for (let i = 0; i < iterations; i++) {
      orderListStringify(records);
    }
    const fastDuration = performance.now() - start2;

    // Manual concatenation (NDJSON)
    const start3 = performance.now();
    for (let i = 0; i < iterations; i++) {
      const lines: string[] = [];
      for (const record of records) {
        lines.push(JSON.stringify(record));
      }
      lines.join('\n');
    }
    const manualDuration = performance.now() - start3;

    return {
      jsonStringify: {
        durationMs: parseFloat(jsonDuration.toFixed(2)),
        opsPerSec: Math.round(iterations / (jsonDuration / 1000)),
      },
      fastJsonStringify: {
        durationMs: parseFloat(fastDuration.toFixed(2)),
        opsPerSec: Math.round(iterations / (fastDuration / 1000)),
      },
      manualConcat: {
        durationMs: parseFloat(manualDuration.toFixed(2)),
        opsPerSec: Math.round(iterations / (manualDuration / 1000)),
      },
    };
  }

  /**
   * Runs all strategies multiple times and returns averaged results.
   */
  async getBenchmarkSummary(runs = 3): Promise<BenchmarkSummary> {
    const strategies = ['buffered', 'streamed', 'chunked', 'compressed'];
    const allResults: StrategyResult[][] = strategies.map(() => []);

    for (let run = 0; run < runs; run++) {
      this.logger.log(`Benchmark run ${run + 1}/${runs}`);

      for (let s = 0; s < strategies.length; s++) {
        const result = await this.measureStrategy(strategies[s], 10_000);
        allResults[s].push(result);
      }
    }

    const averagedStrategies = strategies.map((strategy, s) => {
      const results = allResults[s];
      return {
        strategy,
        durationMs: parseFloat(
          (results.reduce((sum, r) => sum + r.durationMs, 0) / runs).toFixed(2)
        ),
        memoryPeakMB: parseFloat(
          (results.reduce((sum, r) => sum + r.memoryPeakMB, 0) / runs).toFixed(2)
        ),
        bytesWritten: Math.round(
          results.reduce((sum, r) => sum + r.bytesWritten, 0) / runs
        ),
        recordCount: 10_000,
      };
    });

    return {
      strategies: averagedStrategies,
      serializationComparison: this.serializationBenchmark(),
      runs,
    };
  }
}
