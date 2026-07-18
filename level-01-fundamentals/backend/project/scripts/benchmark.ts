// ============================================================================
// Autocannon Benchmark Script
// ============================================================================
// Usage:
//   npx ts-node scripts/benchmark.ts                    # Run all benchmarks
//   npx ts-node scripts/benchmark.ts --compare file1.json file2.json  # Compare mode
// ============================================================================

import autocannon from 'autocannon';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Part 1 — Types and Benchmark Runner
// ============================================================================

interface BenchmarkConfig {
  url: string;
  connections: number;
  pipelining: number;
  duration: number;
  title: string;
  headers?: Record<string, string>;
  body?: string;
}

interface BenchmarkResult {
  title: string;
  url: string;
  connections: number;
  duration: number;
  requests: {
    total: number;
    average: number;
    min: number;
    max: number;
  };
  latency: {
    average: number;
    min: number;
    max: number;
    p50: number;
    p75: number;
    p90: number;
    p99: number;
    p999: number;
  };
  throughput: {
    average: number;
    min: number;
    max: number;
  };
  errors: number;
  timeouts: number;
  non2xx: number;
  start: string;
  finish: string;
  duration: number;
}

/**
 * Runs a single autocannon benchmark and returns the result.
 */
async function runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult> {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: config.url,
        connections: config.connections,
        pipelining: config.pipelining,
        duration: config.duration,
        title: config.title,
        headers: config.headers,
        body: config.body,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result as BenchmarkResult);
      }
    );

    // Print live progress
    autocannon.track(instance, { renderProgressBar: true });
  });
}

// ============================================================================
// Part 2 — Test Scenarios
// ============================================================================

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

const scenarios: BenchmarkConfig[] = [
  {
    title: 'Baseline GET /api/v1/products',
    url: `${BASE_URL}/api/v1/products`,
    connections: 10,
    pipelining: 1,
    duration: 10,
  },
  {
    title: 'High Concurrency GET /api/v1/products',
    url: `${BASE_URL}/api/v1/products`,
    connections: 100,
    pipelining: 1,
    duration: 10,
  },
  {
    title: 'With Query Params',
    url: `${BASE_URL}/api/v1/products?page=1&limit=20&category=electronics`,
    connections: 10,
    pipelining: 1,
    duration: 10,
  },
  {
    title: 'POST /api/v1/products',
    url: `${BASE_URL}/api/v1/products`,
    connections: 10,
    pipelining: 1,
    duration: 10,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Benchmark Product',
      category: 'electronics',
      price: 99.99,
      description: 'Created during benchmark test',
    }),
  },
  {
    title: 'Stats Endpoint',
    url: `${BASE_URL}/api/v1/stats`,
    connections: 10,
    pipelining: 1,
    duration: 10,
  },
];

// ============================================================================
// Part 3 — Results Reporting
// ============================================================================

/** Color codes for terminal output */
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

/**
 * Returns color based on p99 latency threshold.
 */
function getP99Color(p99: number): string {
  if (p99 < 100) return colors.green;
  if (p99 < 500) return colors.yellow;
  return colors.red;
}

/**
 * Formats a benchmark result into a readable console table.
 */
function formatResults(result: BenchmarkResult, index: number): void {
  const p99Color = getP99Color(result.latency.p99);
  const separator = colors.gray + '─'.repeat(60) + colors.reset;

  console.log(`\n${colors.bold}${colors.cyan}[${index + 1}] ${result.title}${colors.reset}`);
  console.log(separator);

  console.log(`${colors.white}  Requests/sec:${colors.reset}`);
  console.log(`    avg: ${colors.bold}${result.requests.average}${colors.reset}  min: ${result.requests.min}  max: ${result.requests.max}`);

  console.log(`\n${colors.white}  Latency (ms):${colors.reset}`);
  console.log(`    p50:  ${result.latency.p50.toFixed(2)}`);
  console.log(`    p75:  ${result.latency.p75.toFixed(2)}`);
  console.log(`    p90:  ${result.latency.p90.toFixed(2)}`);
  console.log(`    ${p99Color}p99:  ${result.latency.p99.toFixed(2)}${colors.reset}`);
  console.log(`    p999: ${result.latency.p999.toFixed(2)}`);

  console.log(`\n${colors.white}  Throughput:${colors.reset}`);
  console.log(`    ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);

  console.log(`\n${colors.white}  Summary:${colors.reset}`);
  console.log(`    Total requests: ${result.requests.total}`);
  console.log(`    Non-2xx:        ${result.non2xx}`);
  console.log(`    Errors:         ${result.errors}`);
  console.log(`    Timeouts:       ${result.timeouts}`);
  console.log(separator);
}

/**
 * Saves all results to a JSON file with timestamp.
 */
function saveResults(results: BenchmarkResult[]): string {
  const timestamp = Date.now();
  const filename = `benchmark-results-${timestamp}.json`;
  const filepath = join(process.cwd(), filename);

  const output = {
    timestamp: new Date(timestamp).toISOString(),
    results: results.map((r) => ({
      title: r.title,
      url: r.url,
      connections: r.connections,
      requestsPerSec: r.requests.average,
      latencyP50: r.latency.p50,
      latencyP99: r.latency.p99,
      throughputMBs: r.throughput.average / 1024 / 1024,
      totalRequests: r.requests.total,
      non2xx: r.non2xx,
    })),
  };

  writeFileSync(filepath, JSON.stringify(output, null, 2));
  return filepath;
}

// ============================================================================
// Part 4 — Comparison Mode
// ============================================================================

interface StoredResult {
  title: string;
  requestsPerSec: number;
  latencyP50: number;
  latencyP99: number;
  throughputMBs: number;
  totalRequests: number;
  non2xx: number;
}

interface ComparisonEntry {
  title: string;
  metric: string;
  before: number;
  after: number;
  change: string;
}

function compareResults(file1Path: string, file2Path: string): void {
  const file1 = JSON.parse(readFileSync(file1Path, 'utf-8'));
  const file2 = JSON.parse(readFileSync(file2Path, 'utf-8'));

  const results1: StoredResult[] = file1.results;
  const results2: StoredResult[] = file2.results;

  console.log(`\n${colors.bold}${colors.cyan}Comparison Mode${colors.reset}`);
  console.log(`${colors.gray}Before: ${file1.timestamp}${colors.reset}`);
  console.log(`${colors.gray}After:  ${file2.timestamp}${colors.reset}\n`);

  const comparisons: ComparisonEntry[] = [];

  for (const r1 of results1) {
    const r2 = results2.find((r) => r.title === r1.title);
    if (!r2) continue;

    const metrics: [keyof StoredResult, string, boolean][] = [
      ['requestsPerSec', 'RPS', false],
      ['latencyP50', 'Latency p50', true],
      ['latencyP99', 'Latency p99', true],
      ['throughputMBs', 'Throughput MB/s', false],
    ];

    for (const [key, label, lowerIsBetter] of metrics) {
      const before = r1[key] as number;
      const after = r2[key] as number;
      const pctChange = ((after - before) / before) * 100;
      const isImprovement = lowerIsBetter ? pctChange < 0 : pctChange > 0;

      comparisons.push({
        title: r1.title,
        metric: label,
        before,
        after,
        change: `${isImprovement ? colors.green : colors.red}${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%${colors.reset}`,
      });
    }
  }

  // Print comparison table
  console.log(
    `${colors.bold}${'Scenario'.padEnd(35)} ${'Metric'.padEnd(20)} ${'Before'.padEnd(12)} ${'After'.padEnd(12)} Change${colors.reset}`
  );
  console.log(colors.gray + '─'.repeat(90) + colors.reset);

  let currentTitle = '';
  for (const c of comparisons) {
    if (c.title !== currentTitle) {
      currentTitle = c.title;
      console.log(`${colors.bold}${colors.cyan}${c.title}${colors.reset}`);
    }
    console.log(
      `  ${''.padEnd(33)} ${c.metric.padEnd(20)} ${c.before.toFixed(1).padEnd(12)} ${c.after.toFixed(1).padEnd(12)} ${c.change}`
    );
  }
  console.log('');
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check for comparison mode
  if (args[0] === '--compare' && args.length >= 3) {
    compareResults(args[1], args[2]);
    return;
  }

  console.log(`${colors.bold}${colors.cyan}`);
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║     Performance Fundamentals Benchmark   ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log(colors.reset);

  console.log(`${colors.gray}Target: ${BASE_URL}${colors.reset}`);
  console.log(`${colors.gray}Scenarios: ${scenarios.length}${colors.reset}`);
  console.log(`${colors.gray}Running sequentially to avoid resource contention...\n${colors.reset}`);

  const allResults: BenchmarkResult[] = [];

  for (let i = 0; i < scenarios.length; i++) {
    console.log(`\n${colors.bold}Running scenario ${i + 1}/${scenarios.length}: ${scenarios[i].title}${colors.reset}`);

    try {
      const result = await runBenchmark(scenarios[i]);
      allResults.push(result);
      formatResults(result, i);
    } catch (err) {
      console.error(`${colors.red}Failed: ${err}${colors.reset}`);
    }
  }

  // Save results
  const filepath = saveResults(allResults);
  console.log(`\n${colors.green}Results saved to ${filepath}${colors.reset}`);

  // Print summary
  console.log(`\n${colors.bold}${colors.cyan}Summary${colors.reset}`);
  console.log(colors.gray + '─'.repeat(50) + colors.reset);

  for (const r of allResults) {
    const p99Color = getP99Color(r.latency.p99);
    console.log(
      `  ${r.title.padEnd(35)} RPS: ${String(r.requests.average).padEnd(8)} p99: ${p99Color}${r.latency.p99.toFixed(0)}ms${colors.reset}`
    );
  }
}

main().catch(console.error);
