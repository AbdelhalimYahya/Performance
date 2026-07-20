/**
 * CPU-INTENSIVE WORKER TASKS
 *
 * This file runs INSIDE a worker thread, not the main thread.
 * Cannot access NestJS dependency injection — it's a plain Node.js module.
 * Receives data via workerData from Piscina.
 *
 * Each task:
 * 1. Receives input data from main thread
 * 2. Performs CPU-bound computation
 * 3. Returns result with timing and thread ID
 *
 * Why these MUST run in worker threads:
 * - sortLargeArray: 1M items blocks event loop for ~200ms
 * - hashPassword: bcrypt intentionally takes ~100ms per hash
 * - generateReport: 10K records with aggregation blocks for ~150ms
 * - parseCSV: 100K rows blocks for ~100ms
 *
 * On main thread: all incoming HTTP requests queue behind these tasks.
 * On worker thread: main thread continues handling requests freely.
 */

import { parentPort, workerData, threadId } from 'worker_threads';

interface TaskPayload {
  workerFile: string;
  [key: string]: unknown;
}

// ─── Task 1: Sort Large Array ───────────────────────────────────────────

function sortLargeArray(data: { array: number[] }): {
  result: number[];
  executionMs: number;
  workerThreadId: number;
} {
  const start = performance.now();

  // Sort with numeric comparator (not default string comparison)
  // [...data.array] creates a copy to avoid mutating the input
  const sorted = [...data.array].sort((a, b) => a - b);

  return {
    result: sorted,
    executionMs: performance.now() - start,
    workerThreadId: threadId,
  };
}

// ─── Task 2: Hash Password (bcrypt) ─────────────────────────────────────

async function hashPassword(data: { password: string; rounds?: number }): Promise<{
  result: string;
  executionMs: number;
  workerThreadId: number;
}> {
  const start = performance.now();

  /**
   * bcrypt with 10 rounds = 2^10 = 1024 iterations of key expansion.
   * Each iteration involves HMAC-SHA256, which is intentionally slow.
   * On main thread: blocks ALL incoming requests for ~100ms.
   * On worker thread: main thread continues handling requests.
   *
   * We simulate the bcrypt cost here since bcryptjs may not be installed.
   * In production, use bcryptjs or native bcrypt.
   */
  const rounds = data.rounds || 10;
  let hash = data.password;

  // Simulate bcrypt work: iterate 2^rounds times with crypto
  const iterations = Math.pow(2, rounds);
  for (let i = 0; i < iterations; i++) {
    // Simulate HMAC-like computation
    let h = 0;
    for (let j = 0; j < hash.length; j++) {
      h = ((h << 5) - h + hash.charCodeAt(j)) | 0;
      h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
      h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    }
    hash = Math.abs(h).toString(16).padStart(8, '0');
  }

  return {
    result: `$2b$10$${hash.repeat(5).slice(0, 53)}`,
    executionMs: performance.now() - start,
    workerThreadId: threadId,
  };
}

// ─── Task 3: Generate Report ────────────────────────────────────────────

function generateReport(data: { records: Array<{ category: string; value: number }> }): {
  result: Record<string, { sum: number; avg: number; min: number; max: number; median: number; count: number }>;
  executionMs: number;
  workerThreadId: number;
} {
  const start = performance.now();

  // Group by category
  const groups: Record<string, number[]> = {};
  for (const record of data.records) {
    if (!groups[record.category]) {
      groups[record.category] = [];
    }
    groups[record.category].push(record.value);
  }

  // Compute aggregations per category
  const result: Record<string, any> = {};
  for (const [category, values] of Object.entries(groups)) {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    const count = sorted.length;
    const min = sorted[0];
    const max = sorted[count - 1];
    const median = count % 2 === 0
      ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
      : sorted[Math.floor(count / 2)];

    result[category] = {
      sum,
      avg: sum / count,
      min,
      max,
      median,
      count,
    };
  }

  return {
    result,
    executionMs: performance.now() - start,
    workerThreadId: threadId,
  };
}

// ─── Task 4: Parse CSV ──────────────────────────────────────────────────

function parseCSV(data: { csv: string }): {
  result: { rowCount: number; errorCount: number; processingTimeMs: number };
  executionMs: number;
  workerThreadId: number;
} {
  const start = performance.now();
  let rowCount = 0;
  let errorCount = 0;

  const lines = data.csv.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;

    const fields = line.split(',');
    // Validate: expect at least 3 fields, second field should be non-empty, third should be numeric
    if (fields.length < 3) {
      errorCount++;
      continue;
    }

    const id = parseInt(fields[0], 10);
    const name = fields[1]?.trim();
    const value = parseFloat(fields[2]);

    if (isNaN(id) || !name || isNaN(value)) {
      errorCount++;
      continue;
    }

    rowCount++;
  }

  return {
    result: {
      rowCount,
      errorCount,
      processingTimeMs: performance.now() - start,
    },
    executionMs: performance.now() - start,
    workerThreadId: threadId,
  };
}

// ─── Task Dispatcher ─────────────────────────────────────────────────────

const tasks: Record<string, (data: any) => Promise<any> | any> = {
  sortLargeArray,
  hashPassword,
  generateReport,
  parseCSV,
};

// Piscina runs this file and passes taskName + data via workerData
const payload = workerData as TaskPayload;

if (payload?.workerFile && tasks[payload.workerFile]) {
  const taskFn = tasks[payload.workerFile];
  taskFn(payload)
    .then((result: any) => parentPort?.postMessage(result))
    .catch((err: Error) => {
      console.error(`Worker task "${payload.workerFile}" failed:`, err);
      process.exit(1);
    });
}

export { sortLargeArray, hashPassword, generateReport, parseCSV };
