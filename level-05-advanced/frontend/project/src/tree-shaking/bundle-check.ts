/**
 * Bundle Check Script — verifies tree shaking worked post-build.
 *
 * Reads .next/static/chunks directory and searches for known strings
 * that should NOT be present after tree shaking.
 *
 * Usage: node src/tree-shaking/bundle-check.ts
 * Exit code 1 if any checks failed (for CI integration).
 */
import * as fs from 'fs';
import * as path from 'path';

interface CheckResult {
  passed: string[];
  failed: string[];
  warnings: string[];
}

const CHUNKS_DIR = path.join(process.cwd(), '.next', 'static', 'chunks');

// Strings that should NOT appear in the bundle after tree shaking
const CHECKS = [
  {
    name: 'lodash CommonJS (require)',
    pattern: /require\(['"]lodash['"]\)/,
    description: 'lodash CommonJS require should not be present (should use lodash-es)',
  },
  {
    name: 'moment.js',
    pattern: /moment\.js|moment\.min\.js/,
    description: 'moment.js should not be bundled (replaced by date-fns)',
  },
  {
    name: 'namespace import pattern',
    pattern: /__esModule.*exports\)/,
    description: 'Babel interop helper suggests CommonJS import was used',
  },
];

function scanChunks(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    console.warn(`Chunks directory not found: ${dir}`);
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanChunks(fullPath));
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      files.push(fullPath);
    }
  }

  return files;
}

function runChecks(): CheckResult {
  const result: CheckResult = { passed: [], failed: [], warnings: [] };
  const chunkFiles = scanChunks(CHUNKS_DIR);

  if (chunkFiles.length === 0) {
    result.warnings.push('No chunk files found — did you run `next build`?');
    return result;
  }

  console.log(`Scanning ${chunkFiles.length} chunk files...\n`);

  for (const check of CHECKS) {
    let found = false;

    for (const file of chunkFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (check.pattern.test(content)) {
        found = true;
        const relativePath = path.relative(process.cwd(), file);
        result.failed.push(`${check.name} found in ${relativePath}: ${check.description}`);
        break;
      }
    }

    if (!found) {
      result.passed.push(`${check.name}: ${check.description}`);
    }
  }

  return result;
}

function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Tree Shaking Bundle Check');
  console.log('═══════════════════════════════════════════\n');

  const result = runChecks();

  if (result.passed.length > 0) {
    console.log('PASSED:');
    for (const msg of result.passed) {
      console.log(`  ✓ ${msg}`);
    }
    console.log('');
  }

  if (result.warnings.length > 0) {
    console.log('WARNINGS:');
    for (const msg of result.warnings) {
      console.log(`  ⚠ ${msg}`);
    }
    console.log('');
  }

  if (result.failed.length > 0) {
    console.log('FAILED:');
    for (const msg of result.failed) {
      console.log(`  ✗ ${msg}`);
    }
    console.log('');
    process.exit(1);
  }

  console.log('All checks passed!');
}

main();
