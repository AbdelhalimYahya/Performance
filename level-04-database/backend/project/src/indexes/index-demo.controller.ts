/**
 * Index Demo Controller — live testing of index impact on query performance.
 *
 * Each endpoint runs a query without an index, then with an index,
 * and returns timing + EXPLAIN output for comparison.
 *
 * Endpoints:
 * - GET /indexes/no-index     — baseline: no index
 * - GET /indexes/btree        — B-tree index comparison
 * - GET /indexes/composite    — composite index vs individual indexes
 * - GET /indexes/partial      — partial index for isActive=true
 * - GET /indexes/covering     — covering index (INCLUDE) vs regular
 * - GET /indexes/compare-all  — runs all scenarios, returns comparison table
 */
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

interface IndexComparison {
  indexType: string;
  query: string;
  withoutIndexMs: number;
  withIndexMs: number;
  speedup: number;
  explainWithout: string[];
  explainWith: string[];
}

@Controller('indexes')
export class IndexDemoController {
  private readonly logger = new Logger(IndexDemoController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /indexes/no-index
   * Baseline: query product by name without any index.
   * Returns timing and EXPLAIN output.
   */
  @Get('no-index')
  @HttpCode(HttpStatus.OK)
  async noIndex() {
    const query = `SELECT * FROM products WHERE name = 'Product 5000 — electronics'`;

    const { result: explainWithout, durationMs: withoutMs } = await this.runWithExplain(query);

    return {
      scenario: 'No Index',
      query,
      durationMs: withoutMs,
      explain: explainWithout,
    };
  }

  /**
   * GET /indexes/btree
   * Creates a B-tree index on name, runs same query, compares.
   */
  @Get('btree')
  @HttpCode(HttpStatus.OK)
  async btree() {
    const query = `SELECT * FROM products WHERE name = 'Product 5000 — electronics'`;

    // Drop index if exists, then create
    await this.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_demo_name`);
    const { durationMs: withoutMs, explain: explainWithout } = await this.runWithExplain(query);

    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_demo_name ON products (name)`,
    );
    const { durationMs: withMs, explain: explainWith } = await this.runWithExplain(query);

    return {
      scenario: 'B-tree Index',
      query,
      withoutIndexMs: withoutMs,
      withIndexMs: withMs,
      speedup: Math.round((withoutMs / withMs) * 100) / 100,
      explainWithout,
      explainWith,
    };
  }

  /**
   * GET /indexes/composite
   * Tests composite index (category, price) vs individual indexes.
   */
  @Get('composite')
  @HttpCode(HttpStatus.OK)
  async composite() {
    const query = `SELECT * FROM products WHERE category = 'electronics' AND price > 100 AND price < 500`;

    // Drop all demo indexes
    await this.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_demo_cat`);
    await this.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_demo_price`);
    await this.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_demo_composite`);

    // Baseline: no index
    const { durationMs: baselineMs, explain: explainBaseline } = await this.runWithExplain(query);

    // Individual indexes (suboptimal)
    await this.prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_demo_cat ON products (category)`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_demo_price ON products (price)`);
    const { durationMs: individualMs, explain: explainIndividual } = await this.runWithExplain(query);

    // Drop individual, create composite
    await this.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_demo_cat`);
    await this.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_demo_price`);
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_demo_composite ON products (category, price)`,
    );
    const { durationMs: compositeMs, explain: explainComposite } = await this.runWithExplain(query);

    return {
      scenario: 'Composite Index',
      query,
      baseline: { durationMs: baselineMs, explain: explainBaseline },
      individualIndexes: { durationMs: individualMs, explain: explainIndividual },
      compositeIndex: { durationMs: compositeMs, explain: explainComposite },
      speedupVsBaseline: Math.round((baselineMs / compositeMs) * 100) / 100,
      speedupVsIndividual: Math.round((individualMs / compositeMs) * 100) / 100,
    };
  }

  /**
   * GET /indexes/partial
   * Partial index: only index active products.
   */
  @Get('partial')
  @HttpCode(HttpStatus.OK)
  async partial() {
    const query = `SELECT * FROM products WHERE isActive = true AND category = 'electronics'`;

    await this.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_demo_partial`);

    const { durationMs: withoutMs, explain: explainWithout } = await this.runWithExplain(query);

    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_demo_partial ON products (category, price) WHERE isActive = true`,
    );
    const { durationMs: withMs, explain: explainWith } = await this.runWithExplain(query);

    return {
      scenario: 'Partial Index',
      query,
      withoutIndexMs: withoutMs,
      withIndexMs: withMs,
      speedup: Math.round((withoutMs / withMs) * 100) / 100,
      explainWithout,
      explainWith,
    };
  }

  /**
   * GET /indexes/covering
   * Covering index with INCLUDE avoids heap access.
   */
  @Get('covering')
  @HttpCode(HttpStatus.OK)
  async covering() {
    const query = `SELECT id, name, price FROM products WHERE category = 'electronics' ORDER BY price`;

    await this.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_demo_regular`);
    await this.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_demo_covering`);

    // Regular index (needs heap access for name, price)
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_demo_regular ON products (category)`,
    );
    const { durationMs: regularMs, explain: explainRegular } = await this.runWithExplain(query);

    // Drop regular, create covering
    await this.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_demo_regular`);
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_demo_covering ON products (category, price) INCLUDE (id, name)`,
    );
    const { durationMs: coveringMs, explain: explainCovering } = await this.runWithExplain(query);

    return {
      scenario: 'Covering Index',
      query,
      regularIndexMs: regularMs,
      coveringIndexMs: coveringMs,
      speedup: Math.round((regularMs / coveringMs) * 100) / 100,
      explainRegular,
      explainCovering,
    };
  }

  /**
   * GET /indexes/compare-all
   * Runs all scenarios and returns a comparison table.
   */
  @Get('compare-all')
  @HttpCode(HttpStatus.OK)
  async compareAll() {
    const scenarios: IndexComparison[] = [];

    // B-tree
    const btree = await this.btree();
    scenarios.push({
      indexType: 'B-tree',
      query: btree.query,
      withoutIndexMs: btree.withoutIndexMs,
      withIndexMs: btree.withIndexMs,
      speedup: btree.speedup,
      explainWithout: btree.explainWithout,
      explainWith: btree.explainWith,
    });

    // Partial
    const partial = await this.partial();
    scenarios.push({
      indexType: 'Partial',
      query: partial.query,
      withoutIndexMs: partial.withoutIndexMs,
      withIndexMs: partial.withIndexMs,
      speedup: partial.speedup,
      explainWithout: partial.explainWithout,
      explainWith: partial.explainWith,
    });

    // Covering
    const covering = await this.covering();
    scenarios.push({
      indexType: 'Covering',
      query: covering.query,
      withoutIndexMs: covering.regularIndexMs,
      withIndexMs: covering.coveringIndexMs,
      speedup: covering.speedup,
      explainWithout: covering.explainRegular,
      explainWith: covering.explainCovering,
    });

    return { scenarios };
  }

  /**
   * Run a query with EXPLAIN ANALYZE and return timing + plan lines.
   */
  private async runWithExplain(
    sql: string,
  ): Promise<{ result: string[]; durationMs: number; explain: string[] }> {
    const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`;

    const start = performance.now();
    const rows = await this.prisma.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(explainSql);
    const durationMs = Math.round((performance.now() - start) * 100) / 100;

    const explain = rows.map((r) => r['QUERY PLAN']);

    return { result: explain, durationMs, explain };
  }
}
