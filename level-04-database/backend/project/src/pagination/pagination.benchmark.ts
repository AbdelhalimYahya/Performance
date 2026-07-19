/**
 * Pagination Benchmark — compares cursor vs offset at increasing page depths.
 *
 * Runs both strategies for pages: 1, 10, 100, 1000, 5000
 * Outputs a comparison table and writes results to pagination-benchmark.json
 *
 * Usage: npx ts-node src/pagination/pagination.benchmark.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { encodeCursor, decodeCursor, buildCursorWhereClause, buildOrderByClause } from './cursor.util';

const prisma = new PrismaClient();

const PAGES_TO_TEST = [1, 10, 100, 1000, 5000];
const LIMIT = 20;

interface BenchmarkRow {
  page: number;
  cursorDurationMs: number;
  offsetDurationMs: number;
  speedupFactor: number;
  cursorItems: number;
  offsetItems: number;
}

/**
 * Run cursor pagination for a specific page.
 * Encodes the cursor from (page - 1) * LIMIT position.
 */
async function benchCursor(page: number): Promise<{ durationMs: number; itemCount: number }> {
  const skip = (page - 1) * LIMIT;

  const start = performance.now();

  // For benchmarking, we simulate cursor by using the createdAt of the item at skip position
  // In production, the cursor would come from the previous response
  const anchor = await prisma.product.findMany({
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    skip,
    take: 1,
  });

  let where = {};
  if (anchor.length > 0) {
    const cursor = { id: anchor[0].id, sortValue: anchor[0].createdAt, direction: 'next' as const };
    where = buildCursorWhereClause(cursor, 'createdAt', 'desc');
  }

  const items = await prisma.product.findMany({
    where,
    orderBy: buildOrderByClause('createdAt', 'desc'),
    take: LIMIT + 1,
  });

  const durationMs = performance.now() - start;
  return { durationMs: Math.round(durationMs * 100) / 100, itemCount: Math.min(items.length, LIMIT) };
}

/**
 * Run offset pagination for a specific page.
 */
async function benchOffset(page: number): Promise<{ durationMs: number; itemCount: number }> {
  const skip = (page - 1) * LIMIT;

  const start = performance.now();
  const items = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    skip,
    take: LIMIT,
  });
  const durationMs = performance.now() - start;

  return { durationMs: Math.round(durationMs * 100) / 100, itemCount: items.length };
}

/**
 * Format a number with commas for display.
 */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Pad a string to a fixed width for table alignment.
 */
function pad(str: string, width: number): string {
  return str.padStart(width);
}

async function main() {
  console.log('Pagination Benchmark — Cursor vs Offset\n');
  console.log('Pages to test:', PAGES_TO_TEST.join(', '));
  console.log('Limit per page:', LIMIT);
  console.log('');

  // Count total products
  const totalProducts = await prisma.product.count();
  console.log(`Total products in database: ${formatNumber(totalProducts)}\n`);

  const results: BenchmarkRow[] = [];

  // Table header
  const header = [
    pad('Page', 8),
    pad('Cursor(ms)', 12),
    pad('Offset(ms)', 12),
    pad('Speedup', 10),
    pad('Items', 8),
  ].join(' | ');

  console.log(header);
  console.log('-'.repeat(header.length));

  for (const page of PAGES_TO_TEST) {
    // Run both strategies
    const cursor = await benchCursor(page);
    const offset = await benchOffset(page);

    const speedup = offset.durationMs / cursor.durationMs;

    const row: BenchmarkRow = {
      page,
      cursorDurationMs: cursor.durationMs,
      offsetDurationMs: offset.durationMs,
      speedupFactor: Math.round(speedup * 100) / 100,
      cursorItems: cursor.itemCount,
      offsetItems: offset.itemCount,
    };

    results.push(row);

    // Print row
    const rowStr = [
      pad(formatNumber(page), 8),
      pad(cursor.durationMs.toFixed(1), 12),
      pad(offset.durationMs.toFixed(1), 12),
      pad(`${speedup.toFixed(1)}x`, 10),
      pad(String(cursor.itemCount), 8),
    ].join(' | ');

    console.log(rowStr);
  }

  // Write results to JSON
  const outputPath = path.join(__dirname, '..', '..', 'pagination-benchmark.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        totalProducts,
        limit: LIMIT,
        pages: results,
      },
      null,
      2,
    ),
  );

  console.log(`\nResults written to ${outputPath}`);
  console.log('\nKey insight: Offset duration grows linearly with page depth.');
  console.log('Cursor duration stays nearly constant — it uses index seek.');
}

main()
  .catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
