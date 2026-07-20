import { Injectable, parentPort, workerData } from 'worker_threads';

/**
 * WORKER THREAD — runs in a separate thread
 *
 * This file is executed by Piscina in a worker thread.
 * Cannot access NestJS dependency injection — it's a plain Node.js module.
 * Receives data via workerData (initial) or task input (per-task).
 *
 * Tasks are dispatched by taskName — a simple switch/map pattern.
 * For complex routing, use a registry object.
 */

interface TaskPayload<T = unknown> {
  taskName: string;
  data: T;
}

// ─── CPU-bound task implementations ─────────────────────────────────────

/**
 * Hash computation — CPU-intensive by design.
 * bcrypt would be ~100ms per hash; this simulates that cost.
 */
async function hashCompute(data: { iterations: number; input: string }): Promise<string> {
  let hash = 0;
  for (let i = 0; i < data.iterations; i++) {
    // Simulate CPU work: multiply, XOR, modulo
    hash = ((hash << 5) - hash + data.input.charCodeAt(i % data.input.length)) | 0;
    hash = Math.abs(hash);
  }
  return `hash_${hash.toString(16)}`;
}

/**
 * Image resize simulation — represents sharp-like CPU work.
 * In production, call sharp natively or use a WASM image processor.
 */
async function imageResize(data: {
  width: number;
  height: number;
  pixels: number;
}): Promise<{ width: number; height: number; processedPixels: number }> {
  // Simulate pixel processing loop
  let processed = 0;
  for (let i = 0; i < data.pixels; i++) {
    processed += Math.sqrt(i) * Math.sin(i * 0.001);
  }
  return {
    width: data.width,
    height: data.height,
    processedPixels: Math.floor(processed),
  };
}

/**
 * Data aggregation — compute statistics on large arrays.
 * Real use: percentile calculation, histogram binning, ML feature extraction.
 */
async function aggregateData(data: { values: number[] }): Promise<{
  mean: number;
  stddev: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}> {
  const sorted = [...data.values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const percentile = (p: number) => sorted[Math.floor(n * p)] ?? 0;

  return {
    mean,
    stddev: Math.sqrt(variance),
    min: sorted[0] ?? 0,
    max: sorted[n - 1] ?? 0,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}

/**
 * JSON parse simulation — large payload parsing.
 * JSON.parse() is synchronous and blocks the event loop for large strings.
 * Worker thread isolates this blocking work from the main thread.
 */
async function parseLargeJson(data: { json: string; parseCount: number }): Promise<{ parsed: number; bytes: number }> {
  let parsed = 0;
  for (let i = 0; i < data.parseCount; i++) {
    try {
      JSON.parse(data.json);
      parsed++;
    } catch {
      // Skip malformed
    }
  }
  return { parsed, bytes: Buffer.byteLength(data.json) };
}

// ─── Task registry ──────────────────────────────────────────────────────

const tasks: Record<string, (data: any) => Promise<any>> = {
  hashCompute,
  imageResize,
  aggregateData,
  parseLargeJson,
};

// ─── Entry point ────────────────────────────────────────────────────────

// Piscina calls this module's default export or runs the file directly.
// When Piscina runs this file, it receives taskName + data via workerData.
const payload = workerData as TaskPayload;

if (payload?.taskName && tasks[payload.taskName]) {
  tasks[payload.taskName](payload.data)
    .then((result) => parentPort?.postMessage(result))
    .catch((err) => {
      console.error(`Worker task "${payload.taskName}" failed:`, err);
      process.exit(1);
    });
}

export { tasks, hashCompute, imageResize, aggregateData, parseLargeJson };
