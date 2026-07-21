#!/usr/bin/env ts-node
/**
 * PERFORMANCE BUDGET — CI Enforcement Script
 *
 * Validates bundle size and Lighthouse scores against configurable budgets.
 * Runs in CI as part of the pull request check pipeline.
 *
 * Usage:
 *   ts-node scripts/perf-budget.ts --url http://localhost:3000
 *   ts-node scripts/perf-budget.ts --url http://localhost:3000 --github
 *   ts-node scripts/perf-budget.ts --url http://localhost:3000 --warn-only
 *
 * Exit codes:
 *   0 — all budget checks passed
 *   1 — one or more budget checks failed
 *   0 (warn-only) — failures logged but exit 0 regardless
 */

import * as fs from 'fs';
import * as path from 'path';
import { gzipSync } from 'zlib';

// ─── CLI Args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
};

const URL = getArg('--url') || 'http://localhost:3000';
const GITHUB_MODE = args.includes('--github');
const WARN_ONLY = args.includes('--warn-only');

// ─── Budget Config ───────────────────────────────────────────────────────

interface BudgetConfig {
  lighthouse: {
    performance: number;
    lcp: number;
    cls: number;
    inp: number;
    tbt: number;
    fcp: number;
  };
  bundle: {
    initialKB: number;
    perChunkKB: number;
    totalKB: number;
  };
  images: {
    maxSizeKB: number;
    requireWebP: boolean;
  };
}

const DEFAULT_BUDGET: BudgetConfig = {
  lighthouse: {
    performance: 85,
    lcp: 2500,
    cls: 0.1,
    inp: 200,
    tbt: 200,
    fcp: 1800,
  },
  bundle: {
    initialKB: 200,
    perChunkKB: 100,
    totalKB: 900,
  },
  images: {
    maxSizeKB: 200,
    requireWebP: true,
  },
};

function loadBudget(): BudgetConfig {
  const configPath = path.join(process.cwd(), '.perfbudget.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return { ...DEFAULT_BUDGET, ...JSON.parse(raw) };
  }
  return DEFAULT_BUDGET;
}

// ─── Lighthouse Runner ───────────────────────────────────────────────────

interface LighthouseResult {
  score: number;
  lcp: number;
  cls: number;
  inp: number;
  tbt: number;
  fcp: number;
  url: string;
  device: 'desktop' | 'mobile';
}

async function runLighthouseForDevice(
  url: string,
  device: 'desktop' | 'mobile'
): Promise<LighthouseResult> {
  // Dynamic import to avoid issues when lighthouse isn't installed
  let lighthouse: any;
  try {
    lighthouse = (await import('lighthouse')).default;
  } catch {
    console.warn('[PERF-BUDGET] lighthouse package not installed, returning mock data');
    return {
      score: 0, lcp: 0, cls: 0, inp: 0, tbt: 0, fcp: 0, url, device,
    };
  }

  const chrome = await (await import('chrome-launcher')).launch({
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
  });

  const result = await lighthouse(url, {
    port: chrome.port,
    onlyCategories: ['performance'],
    throttlingMethod: 'simulate',
    preset: device,
    output: 'json',
  });

  await chrome.kill();

  const audits = result.lhr.audits;

  return {
    score: (result.lhr.categories.performance?.score || 0) * 100,
    lcp: audits['largest-contentful-paint']?.numericValue || 0,
    cls: audits['cumulative-layout-shift']?.numericValue || 0,
    inp: audits['interaction-to-next-paint']?.numericValue || 0,
    tbt: audits['total-blocking-time']?.numericValue || 0,
    fcp: audits['first-contentful-paint']?.numericValue || 0,
    url,
    device,
  };
}

async function runLighthouse(url: string): Promise<LighthouseResult[]> {
  const runs: LighthouseResult[] = [];

  // Run 3 times per device to get median
  for (const device of ['desktop', 'mobile'] as const) {
    for (let i = 0; i < 3; i++) {
      console.log(`  Running Lighthouse ${device} (${i + 1}/3)...`);
      const result = await runLighthouseForDevice(url, device);
      runs.push(result);
    }
  }

  return runs;
}

// ─── Bundle Checker ──────────────────────────────────────────────────────

interface ChunkInfo {
  name: string;
  rawKB: number;
  gzipKB: number;
}

function readBuildManifest(): ChunkInfo[] {
  const manifestPath = path.join(process.cwd(), '.next', 'build-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.warn('[PERF-BUDGET] build-manifest.json not found, skipping bundle check');
    return [];
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const chunks: ChunkInfo[] = [];

  for (const [key, files] of Object.entries(manifest) as [string, string[]][]) {
    for (const file of files) {
      const filePath = path.join(process.cwd(), '.next', 'static', file);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath);
        const gzip = gzipSync(raw);
        chunks.push({
          name: file,
          rawKB: raw.length / 1024,
          gzipKB: gzip.length / 1024,
        });
      }
    }
  }

  return chunks;
}

interface BundleCheck {
  name: string;
  actualKB: number;
  gzipKB: number;
  budgetKB: number;
  passed: boolean;
}

function checkBundleBudgets(
  chunks: ChunkInfo[],
  budget: BudgetConfig['bundle']
): BundleCheck[] {
  const checks: BundleCheck[] = [];

  for (const chunk of chunks) {
    const isInitial = chunk.name.includes('main') || chunk.name.includes('pages');
    const budgetKB = isInitial ? budget.initialKB : budget.perChunkKB;

    checks.push({
      name: chunk.name,
      actualKB: chunk.rawKB,
      gzipKB: chunk.gzipKB,
      budgetKB,
      passed: chunk.rawKB <= budgetKB,
    });
  }

  // Total check
  const totalRaw = chunks.reduce((sum, c) => sum + c.rawKB, 0);
  checks.push({
    name: '__TOTAL__',
    actualKB: totalRaw,
    gzipKB: 0,
    budgetKB: budget.totalKB,
    passed: totalRaw <= budget.totalKB,
  });

  return checks;
}

// ─── Results Reporter ────────────────────────────────────────────────────

interface ReportData {
  lighthouse: LighthouseResult[];
  bundle: BundleCheck[];
  budget: BudgetConfig;
}

function formatLighthouseTable(results: LighthouseResult[]): string {
  const medians = getMedians(results);
  const budget = loadBudget().lighthouse;
  const lines: string[] = [];

  lines.push('| Metric | Value | Budget | Status |');
  lines.push('|--------|-------|--------|--------|');

  const checks: [string, number, number, boolean][] = [
    ['Performance Score', medians.score, budget.performance, medians.score >= budget.performance],
    ['LCP (ms)', medians.lcp, budget.lcp, medians.lcp <= budget.lcp],
    ['CLS', medians.cls, budget.cls, medians.cls <= budget.cls],
    ['INP (ms)', medians.inp, budget.inp, medians.inp <= budget.inp],
    ['TBT (ms)', medians.tbt, budget.tbt, medians.tbt <= budget.tbt],
    ['FCP (ms)', medians.fcp, budget.fcp, medians.fcp <= budget.fcp],
  ];

  for (const [name, value, limit, passed] of checks) {
    const status = passed ? '✅' : '❌';
    lines.push(`| ${name} | ${typeof value === 'number' && value < 1 ? value.toFixed(3) : Math.round(value)} | ${limit} | ${status} |`);
  }

  return lines.join('\n');
}

function formatBundleTable(checks: BundleCheck[]): string {
  const lines: string[] = [];
  lines.push('| Chunk | Size (KB) | Gzip (KB) | Budget (KB) | Status |');
  lines.push('|-------|-----------|-----------|-------------|--------|');

  for (const check of checks) {
    const status = check.passed ? '✅' : '❌';
    const name = check.name === '__TOTAL__' ? 'TOTAL' : check.name;
    lines.push(`| ${name} | ${check.actualKB.toFixed(1)} | ${check.gzipKB.toFixed(1)} | ${check.budgetKB} | ${status} |`);
  }

  return lines.join('\n');
}

function getMedians(results: LighthouseResult[]): LighthouseResult {
  const median = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  return {
    score: median(results.map((r) => r.score)),
    lcp: median(results.map((r) => r.lcp)),
    cls: median(results.map((r) => r.cls)),
    inp: median(results.map((r) => r.inp)),
    tbt: median(results.map((r) => r.tbt)),
    fcp: median(results.map((r) => r.fcp)),
    url: results[0].url,
    device: results[0].device,
  };
}

function printReport(data: ReportData) {
  console.log('\n' + '═'.repeat(60));
  console.log('  PERFORMANCE BUDGET REPORT');
  console.log('═'.repeat(60));

  console.log('\n📊 Lighthouse Results:');
  console.log(formatLighthouseTable(data.lighthouse));

  console.log('\n📦 Bundle Results:');
  console.log(formatBundleTable(data.bundle));

  // Write JSON report for CI artifact
  const reportPath = path.join(process.cwd(), 'perf-budget-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(data, null, 2));
  console.log(`\n📄 Report saved to ${reportPath}`);
}

// ─── GitHub PR Comment ───────────────────────────────────────────────────

async function postGitHubComment(data: ReportData) {
  const token = process.env.GITHUB_TOKEN;
  const prNumber = process.env.PR_NUMBER;

  if (!token || !prNumber) {
    console.warn('[PERF-BUDGET] GITHUB_TOKEN or PR_NUMBER not set, skipping comment');
    return;
  }

  const body = [
    '## 📊 Performance Budget Report',
    '',
    '### Lighthouse',
    formatLighthouseTable(data.lighthouse),
    '',
    '### Bundle Size',
    formatBundleTable(data.bundle),
    '',
    WARN_ONLY ? '_⚠️ Warn-only mode: failures will not block the PR._' : '',
  ].join('\n');

  try {
    const repo = process.env.GITHUB_REPOSITORY;
    const apiUrl = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;

    await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    });

    console.log('[PERF-BUDGET] Posted PR comment successfully');
  } catch (error) {
    console.error('[PERF-BUDGET] Failed to post PR comment:', error);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log('  PERFORMANCE BUDGET ENFORCEMENT');
  console.log(`  URL: ${URL}`);
  console.log(`  Mode: ${WARN_ONLY ? 'warn-only' : 'strict'}`);
  console.log('═'.repeat(60));

  const budget = loadBudget();

  // Run Lighthouse
  console.log('\n🔬 Running Lighthouse audits...');
  const lighthouseResults = await runLighthouse(URL);

  // Check bundles
  console.log('\n📦 Checking bundle sizes...');
  const chunks = readBuildManifest();
  const bundleChecks = checkBundleBudgets(chunks, budget.bundle);

  // Print report
  const data: ReportData = {
    lighthouse: lighthouseResults,
    bundle: bundleChecks,
    budget,
  };
  printReport(data);

  // GitHub PR comment
  if (GITHUB_MODE) {
    await postGitHubComment(data);
  }

  // Collect failures
  const failures: string[] = [];
  const medians = getMedians(lighthouseResults);

  // Lighthouse failures
  if (medians.score < budget.lighthouse.performance) {
    failures.push(`Performance score: ${Math.round(medians.score)} < ${budget.lighthouse.performance}`);
  }
  if (medians.lcp > budget.lighthouse.lcp) {
    failures.push(`LCP: ${Math.round(medians.lcp)}ms > ${budget.lighthouse.lcp}ms (${(((medians.lcp / budget.lighthouse.lcp) - 1) * 100).toFixed(1)}% over)`);
  }
  if (medians.cls > budget.lighthouse.cls) {
    failures.push(`CLS: ${medians.cls.toFixed(3)} > ${budget.lighthouse.cls}`);
  }
  if (medians.inp > budget.lighthouse.inp) {
    failures.push(`INP: ${Math.round(medians.inp)}ms > ${budget.lighthouse.inp}ms`);
  }
  if (medians.tbt > budget.lighthouse.tbt) {
    failures.push(`TBT: ${Math.round(medians.tbt)}ms > ${budget.lighthouse.tbt}ms`);
  }
  if (medians.fcp > budget.lighthouse.fcp) {
    failures.push(`FCP: ${Math.round(medians.fcp)}ms > ${budget.lighthouse.fcp}ms`);
  }

  // Bundle failures
  for (const check of bundleChecks) {
    if (!check.passed) {
      failures.push(`Bundle ${check.name}: ${check.actualKB.toFixed(1)}KB > ${check.budgetKB}KB`);
    }
  }

  // Exit logic
  if (failures.length > 0) {
    console.log('\n❌ FAILED CHECKS:');
    for (const f of failures) console.log(`  • ${f}`);

    if (WARN_ONLY) {
      console.log('\n⚠️  Warn-only mode — exiting 0');
      process.exit(0);
    }
    process.exit(1);
  }

  console.log('\n✅ All performance budget checks passed');
  process.exit(0);
}

main().catch((err) => {
  console.error('[PERF-BUDGET] Fatal error:', err);
  process.exit(1);
});
