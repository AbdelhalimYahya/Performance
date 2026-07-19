/**
 * Database benchmark script — compares cursor vs offset pagination performance.
 *
 * Usage: npx ts-node scripts/benchmark.ts
 *
 * Tests:
 * 1. Cursor pagination (index seek — fast at any depth)
 * 2. Offset pagination (scans rows — slow at high offsets)
 * 3. Bulk insert performance (batch vs individual)
 * 4. N+1 vs DataLoader (query count comparison)
 */
import { Client } from 'pg';

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'perf_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

interface BenchmarkResult {
  name: string;
  queries: number;
  rowsScanned: number;
  durationMs: number;
  rowsPerSecond: number;
}

async function measure(
  name: string,
  fn: () => Promise<void>,
): Promise<BenchmarkResult> {
  const start = performance.now();
  await fn();
  const durationMs = performance.now() - start;
  return {
    name,
    queries: 0,
    rowsScanned: 0,
    durationMs: Math.round(durationMs),
    rowsPerSecond: 0,
  };
}

async function benchmarkCursorPagination(): Promise<BenchmarkResult> {
  console.log('\n--- Cursor Pagination (fast at any depth) ---');

  let cursor: string | null = null;
  let totalRows = 0;
  let pages = 0;
  const startTime = performance.now();

  // Fetch 50 pages (1000 rows)
  for (let i = 0; i < 50; i++) {
    let query: string;
    let params: unknown[];

    if (cursor) {
      // Decode cursor to get createdAt and id
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      query = `
        SELECT id, name, price, category, created_at
        FROM products
        WHERE (created_at, id) > ($1, $2)
        ORDER BY created_at, id
        LIMIT 20
      `;
      params = [decoded.createdAt, decoded.id];
    } else {
      query = `
        SELECT id, name, price, category, created_at
        FROM products
        ORDER BY created_at, id
        LIMIT 20
      `;
      params = [];
    }

    const result = await client.query(query, params);
    totalRows += result.rowCount ?? 0;
    pages++;

    if (result.rows.length === 0) break;

    const lastRow = result.rows[result.rows.length - 1];
    cursor = Buffer.from(
      JSON.stringify({
        createdAt: lastRow.created_at.toISOString(),
        id: lastRow.id,
      }),
    ).toString('base64url');
  }

  const durationMs = performance.now() - startTime;

  return {
    name: 'Cursor Pagination (50 pages)',
    queries: pages,
    rowsScanned: totalRows,
    durationMs: Math.round(durationMs),
    rowsPerSecond: Math.round(totalRows / (durationMs / 1000)),
  };
}

async function benchmarkOffsetPagination(): Promise<BenchmarkResult> {
  console.log('\n--- Offset Pagination (slow at high offsets) ---');

  let totalRows = 0;
  let pages = 0;
  const startTime = performance.now();

  // Fetch 50 pages — each page scans more rows
  for (let i = 0; i < 50; i++) {
    const offset = i * 20;
    const result = await client.query(
      `
      SELECT id, name, price, category, created_at
      FROM products
      ORDER BY created_at, id
      OFFSET $1
      LIMIT 20
    `,
      [offset],
    );

    totalRows += result.rowCount ?? 0;
    pages++;

    if (result.rows.length === 0) break;
  }

  const durationMs = performance.now() - startTime;

  return {
    name: 'Offset Pagination (50 pages)',
    queries: pages,
    rowsScanned: totalRows,
    durationMs: Math.round(durationMs),
    rowsPerSecond: Math.round(totalRows / (durationMs / 1000)),
  };
}

async function benchmarkBulkInsert(): Promise<{
  individual: BenchmarkResult;
  batched: BenchmarkResult;
}> {
  console.log('\n--- Bulk Insert: Individual vs Batched ---');

  // Individual inserts (N+1 pattern)
  const individualStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    await client.query(
      `INSERT INTO products (name, price, category, stock, "isActive", "sellerId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, true, (SELECT id FROM users LIMIT 1), NOW(), NOW())`,
      [`Benchmark Product ${i}`, 99.99, 'benchmark', 100],
    );
  }
  const individualDuration = performance.now() - individualStart;

  // Batch insert (single query)
  const batchedStart = performance.now();
  const values: string[] = [];
  const params: unknown[] = [];
  for (let i = 0; i < 1000; i++) {
    values.push(
      `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, true, (SELECT id FROM users LIMIT 1), NOW(), NOW())`,
    );
    params.push(`Batch Product ${i}`, 99.99, 'benchmark', 100);
  }
  await client.query(
    `INSERT INTO products (name, price, category, stock, "isActive", "sellerId", "createdAt", "updatedAt")
     VALUES ${values.join(', ')}`,
    params,
  );
  const batchedDuration = performance.now() - batchedStart;

  return {
    individual: {
      name: 'Individual INSERT × 1000',
      queries: 1000,
      rowsScanned: 1000,
      durationMs: Math.round(individualDuration),
      rowsPerSecond: Math.round(1000 / (individualDuration / 1000)),
    },
    batched: {
      name: 'Batch INSERT × 1',
      queries: 1,
      rowsScanned: 1000,
      durationMs: Math.round(batchedDuration),
      rowsPerSecond: Math.round(1000 / (batchedDuration / 1000)),
    },
  };
}

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL');
  console.log('Running database performance benchmarks...\n');

  // Count total products
  const countResult = await client.query('SELECT COUNT(*) FROM products');
  console.log(`Total products in database: ${countResult.rows[0].count}`);

  // Run benchmarks
  const cursorResult = await benchmarkCursorPagination();
  const offsetResult = await benchmarkOffsetPagination();
  const { individual, batched } = await benchmarkBulkInsert();

  // Print results
  console.log('\n═══════════════════════════════════════════════');
  console.log('  DATABASE PERFORMANCE BENCHMARK RESULTS');
  console.log('═══════════════════════════════════════════════\n');

  const results = [cursorResult, offsetResult, individual, batched];
  for (const r of results) {
    console.log(`  ${r.name}`);
    console.log(`    Queries: ${r.queries}`);
    console.log(`    Duration: ${r.durationMs}ms`);
    console.log(`    Rows: ${r.rowsScanned}`);
    console.log(`    Rate: ${r.rowsPerSecond} rows/sec`);
    console.log('');
  }

  // Comparison
  console.log('  COMPARISON');
  console.log(`    Cursor vs Offset speedup: ${Math.round(offsetResult.durationMs / cursorResult.durationMs)}x`);
  console.log(`    Batch vs Individual speedup: ${Math.round(individual.durationMs / batched.durationMs)}x`);
  console.log('═══════════════════════════════════════════════\n');

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
