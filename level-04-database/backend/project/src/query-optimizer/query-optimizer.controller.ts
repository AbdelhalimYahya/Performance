/**
 * Query Optimizer Controller — REST endpoints for database query analysis.
 *
 * Endpoints:
 * - GET  /query-optimizer/explain        — run EXPLAIN ANALYZE on a SQL query
 * - GET  /query-optimizer/slow-queries   — top 20 slowest queries from pg_stat_statements
 * - GET  /query-optimizer/unused-indexes — indexes with zero scans
 * - GET  /query-optimizer/missing-indexes — tables with excessive seq scans
 * - GET  /query-optimizer/stats          — full database health report
 * - POST /query-optimizer/reset-stats    — reset pg_stat_statements counters
 */
import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import {
  QueryAnalyzerService,
  ExplainResult,
  SlowQuery,
  IndexStats,
  TableStats,
  BloatStats,
  DatabaseStats,
} from './query-analyzer.service';

/**
 * DTO for the explain endpoint body.
 */
class ExplainDto {
  sql!: string;
  params?: unknown[];
}

@Controller('query-optimizer')
export class QueryOptimizerController {
  constructor(private readonly analyzer: QueryAnalyzerService) {}

  /**
   * POST /query-optimizer/explain
   * Runs EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) on the provided SQL.
   * Returns structured analysis including seq scan detection,
   * index usage, and row estimation accuracy.
   */
  @Post('explain')
  @HttpCode(HttpStatus.OK)
  async explain(
    @Body(new ValidationPipe({ transform: true })) body: ExplainDto,
  ): Promise<ExplainResult> {
    return this.analyzer.explainQuery(body.sql, body.params ?? []);
  }

  /**
   * GET /query-optimizer/slow-queries
   * Returns top 20 slowest queries from pg_stat_statements.
   * Sorted by mean execution time descending.
   */
  @Get('slow-queries')
  @HttpCode(HttpStatus.OK)
  async slowQueries(): Promise<{ queries: SlowQuery[] }> {
    const queries = await this.analyzer.findSlowQueries();
    return { queries };
  }

  /**
   * GET /query-optimizer/unused-indexes
   * Finds indexes with zero scans — candidates for removal.
   * Excludes primary and unique constraint indexes.
   */
  @Get('unused-indexes')
  @HttpCode(HttpStatus.OK)
  async unusedIndexes(): Promise<{ indexes: IndexStats[] }> {
    const indexes = await this.analyzer.findUnusedIndexes();
    return { indexes };
  }

  /**
   * GET /query-optimizer/missing-indexes
   * Tables with seq_scan > 100 and n_live_tup > 1000.
   * These are strong candidates for adding an index.
   */
  @Get('missing-indexes')
  @HttpCode(HttpStatus.OK)
  async missingIndexes(): Promise<{ tables: TableStats[] }> {
    const tables = await this.analyzer.findMissingIndexes();
    return { tables };
  }

  /**
   * GET /query-optimizer/stats
   * Full database health report: connections, cache hit ratio,
   * dead tuples, database size, and uptime.
   */
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async stats(): Promise<DatabaseStats> {
    return this.analyzer.getDatabaseStats();
  }

  /**
   * POST /query-optimizer/reset-stats
   * Resets pg_stat_statements counters.
   * Use after deploying query fixes to get fresh baselines.
   */
  @Post('reset-stats')
  @HttpCode(HttpStatus.OK)
  async resetStats(): Promise<{ message: string }> {
    try {
      await this.analyzer['prisma'].$executeRawUnsafe(
        'SELECT pg_stat_statements_reset()',
      );
      return { message: 'pg_stat_statements counters reset successfully' };
    } catch {
      return {
        message:
          'pg_stat_statements extension not available. Install it to enable stats reset.',
      };
    }
  }
}
