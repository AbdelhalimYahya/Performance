#!/usr/bin/env node
/**
 * Bundle Size CI — Analysis & Budget Enforcement Script
 *
 * Reads Next.js build output, computes gzipped sizes, enforces budgets,
 * detects regressions, and produces CI-ready reports.
 *
 * Usage:
 *   npx ts-node scripts/bundle-analyze.ts
 *   npx ts-node scripts/bundle-analyze.ts --warn-only
 *   npx ts-node scripts/bundle-analyze.ts --json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// ─── Types ─────────────────────────────────────────────────────

interface ChunkInfo {
  name: string;
  filePath: string;
  sizeBytes: number;
  gzippedBytes: number;
  isInitial: boolean;
  isAsync: boolean;
  pages: string[];
}

interface BundleReport {
  timestamp: string;
  chunks: ChunkInfo[];
  totalSize: number;
  totalGzipped: number;
  largestChunk: ChunkInfo | null;
  pageBreakdown: Record<string, number>;
}

interface BudgetConfig {
  initialBundleMaxKB: number;
  perChunkMaxKB: number;
  totalBundleMaxKB: number;
  perRouteMaxKB: number;
}

interface BudgetResult {
  rule: string;
  actual: number;
  limit: number;
  passed: boolean;
  message: string;
}

// ─── Constants ─────────────────────────────────────────────────

const ROOT = process.cwd();
const NEXT_BUILD_DIR = path.join(ROOT, '.next');
const CHUNKS_DIR = path.join(NEXT_BUILD_DIR, 'static', 'chunks');
const BUILD_MANIFEST = path.join(NEXT_BUILD_DIR, 'build-manifest.json');
const BUDGET_FILE = path.join(ROOT, '.bundlebudget.json');
const BASELINE_FILE = path.join(ROOT, 'bundle-baseline.json');
const REPORT_FILE = path.join(ROOT, 'bundle-report.json');

const DEFAULT_BUDGETS: BudgetConfig = {
  initialBundleMaxKB: 200,
  perChunkMaxKB: 100,
  totalBundleMaxKB: 1000,
  perRouteMaxKB: 150,
};

const KB = 1024;

// ─── Part 1: Bundle Parser ────────────────────────────────────

function loadBuildManifest(): Record<string, string[]> {
  if (!fs.existsSync(BUILD_MANIFEST)) {
    console.error(`Build manifest not found: ${BUILD_MANIFEST}`);
    console.error('Run `next build` first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(BUILD_MANIFEST, 'utf-8'));
}

function gzipSizeSync(buffer: Buffer): number {
  return zlib.gzipSync(buffer, { level: 9 }).length;
}

function collectChunkFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectChunkFiles(fullPath));
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      files.push(fullPath);
    }
  }
  return files;
}

function buildChunkMap(manifest: Record<string, string[]>): Map<string, string[]> {
  const chunkToPages = new Map<string, string[]>();
  for (const [page, chunks] of Object.entries(manifest)) {
    for (const chunk of chunks) {
      const existing = chunkToPages.get(chunk) || [];
      existing.push(page);
      chunkToPages.set(chunk, existing);
    }
  }
  return chunkToPages;
}

function parseBundle(): BundleReport {
  const manifest = loadBuildManifest();
  const chunkToPages = buildChunkMap(manifest);
  const chunkFiles = collectChunkFiles(CHUNKS_DIR);

  const chunks: ChunkInfo[] = [];

  for (const filePath of chunkFiles) {
    const buffer = fs.readFileSync(filePath);
    const relativePath = path.relative(ROOT, filePath);
    const name = path.basename(filePath);
    const pages = chunkToPages.get(relativePath) || [];
    const isInitial = name.startsWith('main') || name.startsWith('framework') ||
      name.startsWith('polyfills') || pages.some((p) => p === '/');

    chunks.push({
      name,
      filePath: relativePath,
      sizeBytes: buffer.length,
      gzippedBytes: gzipSizeSync(buffer),
      isInitial,
      isAsync: !isInitial,
      pages,
    });
  }

  // Sort by gzipped size descending
  chunks.sort((a, b) => b.gzippedBytes - a.gzippedBytes);

  const totalSize = chunks.reduce((s, c) => s + c.sizeBytes, 0);
  const totalGzipped = chunks.reduce((s, c) => s + c.gzippedBytes, 0);

  // Page breakdown: total gzipped per route
  const pageBreakdown: Record<string, number> = {};
  for (const chunk of chunks) {
    for (const page of chunk.pages) {
      pageBreakdown[page] = (pageBreakdown[page] || 0) + chunk.gzippedBytes;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    chunks,
    totalSize,
    totalGzipped,
    largestChunk: chunks[0] || null,
    pageBreakdown,
  };
}

// ─── Part 2: Budget Definitions ───────────────────────────────

function loadBudgets(): BudgetConfig {
  const budgets = { ...DEFAULT_BUDGETS };

  if (fs.existsSync(BUDGET_FILE)) {
    const custom = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf-8'));
    Object.assign(budgets, custom);
    console.log(`Loaded custom budgets from ${BUDGET_FILE}`);
  }

  return budgets;
}

// ─── Part 3: Budget Checker ───────────────────────────────────

function loadBaseline(): Record<string, number> | null {
  if (!fs.existsSync(BASELINE_FILE)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
}

function checkBudgets(report: BundleReport, budgets: BudgetConfig): BudgetResult[] {
  const results: BudgetResult[] = [];
  const baseline = loadBaseline();

  // Check 1: Initial bundle size
  const initialGzipped = report.chunks
    .filter((c) => c.isInitial)
    .reduce((s, c) => s + c.gzippedBytes, 0);
  results.push({
    rule: 'Initial bundle size',
    actual: initialGzipped / KB,
    limit: budgets.initialBundleMaxKB,
    passed: initialGzipped / KB <= budgets.initialBundleMaxKB,
    message: `Initial bundle: ${(initialGzipped / KB).toFixed(1)}KB (limit: ${budgets.initialBundleMaxKB}KB)`,
  });

  // Check 2: Largest single chunk
  if (report.largestChunk) {
    const largestKb = report.largestChunk.gzippedBytes / KB;
    results.push({
      rule: 'Largest chunk',
      actual: largestKb,
      limit: budgets.perChunkMaxKB,
      passed: largestKb <= budgets.perChunkMaxKB,
      message: `Largest chunk "${report.largestChunk.name}": ${largestKb.toFixed(1)}KB (limit: ${budgets.perChunkMaxKB}KB)`,
    });
  }

  // Check 3: Total bundle size
  const totalKb = report.totalGzipped / KB;
  results.push({
    rule: 'Total bundle size',
    actual: totalKb,
    limit: budgets.totalBundleMaxKB,
    passed: totalKb <= budgets.totalBundleMaxKB,
    message: `Total bundle: ${totalKb.toFixed(1)}KB (limit: ${budgets.totalBundleMaxKB}KB)`,
  });

  // Check 4: Per-route bundle size
  for (const [route, sizeBytes] of Object.entries(report.pageBreakdown)) {
    const routeKb = sizeBytes / KB;
    results.push({
      rule: `Route: ${route}`,
      actual: routeKb,
      limit: budgets.perRouteMaxKB,
      passed: routeKb <= budgets.perRouteMaxKB,
      message: `Route ${route}: ${routeKb.toFixed(1)}KB (limit: ${budgets.perRouteMaxKB}KB)`,
    });
  }

  // Check 5: Regression check against baseline
  if (baseline) {
    for (const chunk of report.chunks) {
      const baselineSize = baseline[chunk.name];
      if (baselineSize && baselineSize > 0) {
        const growth = ((chunk.gzippedBytes - baselineSize) / baselineSize) * 100;
        if (growth > 20) {
          results.push({
            rule: `Regression: ${chunk.name}`,
            actual: chunk.gzippedBytes / KB,
            limit: (baselineSize / KB) * 1.2,
            passed: false,
            message: `${chunk.name} grew ${growth.toFixed(1)}% since baseline (${(baselineSize / KB).toFixed(1)}KB → ${(chunk.gzippedBytes / KB).toFixed(1)}KB)`,
          });
        }
      }
    }
  }

  return results;
}

// ─── Part 4: Reporter ─────────────────────────────────────────

function printTable(report: BundleReport): void {
  console.log('\n  Chunk Name'.padEnd(40) + 'Size'.padStart(10) + 'Gzipped'.padStart(10) + '  Status');
  console.log('  ' + '─'.repeat(70));

  for (const chunk of report.chunks.slice(0, 20)) {
    const sizeKb = (chunk.sizeBytes / KB).toFixed(1);
    const gzKb = (chunk.gzippedBytes / KB).toFixed(1);
    const overBudget = chunk.gzippedBytes / KB > DEFAULT_BUDGETS.perChunkMaxKB;
    const status = overBudget ? 'FAIL' : 'PASS';
    const icon = overBudget ? '✗' : '✓';

    console.log(
      `  ${chunk.name.substring(0, 38).padEnd(40)}` +
      `${sizeKb.padStart(8)}KB` +
      `${gzKb.padStart(8)}KB` +
      `  ${icon} ${status}`
    );
  }
}

function printTop10(report: BundleReport): void {
  console.log('\n  Top 10 Largest Chunks (gzipped):');
  console.log('  ' + '─'.repeat(50));

  report.chunks.slice(0, 10).forEach((chunk, i) => {
    const gzKb = (chunk.gzippedBytes / KB).toFixed(1);
    console.log(`  ${(i + 1).toString().padStart(2)}. ${chunk.name.substring(0, 35).padEnd(37)} ${gzKb.padStart(7)}KB`);
  });
}

function printBudgetResults(results: BudgetResult[]): void {
  const failures = results.filter((r) => !r.passed);
  const passed = results.filter((r) => r.passed);

  console.log(`\n  Budget Checks: ${passed.length} passed, ${failures.length} failed`);

  if (failures.length > 0) {
    console.log('\n  Failed Budgets:');
    for (const f of failures) {
      const overBy = (f.actual - f.limit).toFixed(1);
      const overPct = (((f.actual - f.limit) / f.limit) * 100).toFixed(1);
      console.log(`  ✗ ${f.rule}`);
      console.log(`    ${f.message}`);
      console.log(`    Over budget by ${overBy}KB (${overPct}%)`);
    }
  }
}

function writeReport(report: BundleReport, results: BudgetResult[]): void {
  fs.writeFileSync(REPORT_FILE, JSON.stringify({ report, results }, null, 2));
  console.log(`\n  Report written to ${REPORT_FILE}`);
}

function updateBaseline(report: BundleReport): void {
  const baseline: Record<string, number> = {};
  for (const chunk of report.chunks) {
    baseline[chunk.name] = chunk.gzippedBytes;
  }
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
}

// ─── Part 5: Exit Logic ───────────────────────────────────────

function parseArgs(): { warnOnly: boolean; jsonOnly: boolean } {
  const args = process.argv.slice(2);
  return {
    warnOnly: args.includes('--warn-only'),
    jsonOnly: args.includes('--json'),
  };
}

function main() {
  const { warnOnly, jsonOnly } = parseArgs();

  // Parse bundle
  const report = parseBundle();
  const budgets = loadBudgets();
  const results = checkBudgets(report, budgets);

  // JSON-only mode
  if (jsonOnly) {
    console.log(JSON.stringify({ report, results }, null, 2));
    const hasFailures = results.some((r) => !r.passed);
    process.exit(hasFailures && !warnOnly ? 1 : 0);
    return;
  }

  // Console output
  console.log('\n═══════════════════════════════════════════');
  console.log('  Bundle Size Analysis');
  console.log('═══════════════════════════════════════════');

  printTable(report);
  printTop10(report);
  printBudgetResults(results);

  // Summary
  const totalKb = (report.totalGzipped / KB).toFixed(1);
  console.log(`\n  Total: ${totalKb}KB gzipped across ${report.chunks.length} chunks`);

  // Write artifacts
  writeReport(report, results);
  updateBaseline(report);

  // Exit
  const hasFailures = results.some((r) => !r.passed);
  if (hasFailures && !warnOnly) {
    console.log('\n  Build failed: budget violations detected.');
    console.log('  Use --warn-only to downgrade to warnings during migration.\n');
    process.exit(1);
  }

  if (hasFailures && warnOnly) {
    console.log('\n  Warning: budget violations detected (--warn-only mode).\n');
  } else {
    console.log('\n  All budgets passed!\n');
  }
}

main();
