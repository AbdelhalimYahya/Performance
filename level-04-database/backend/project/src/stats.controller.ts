/**
 * Stats controller — database health and pool monitoring endpoints.
 *
 * Provides:
 * - Connection pool status (active, idle, waiting)
 * - Table sizes and index usage
 * - Query performance statistics
 */
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('api/stats')
export class StatsController {
  constructor(private readonly dataSource: DataSource) {}

  // GET /api/stats/pool
  @Get('pool')
  @HttpCode(HttpStatus.OK)
  async getPoolStats() {
    // PostgreSQL pg_stat_activity: count connections by state
    const result = await this.dataSource.query(`
      SELECT
        state,
        COUNT(*) as count
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY state
    `);

    const poolConfig = {
      min: 5,
      max: 20,
      idleTimeoutMs: 30000,
      connectionTimeoutMs: 5000,
    };

    return {
      pool: poolConfig,
      connections: result,
      recommendation:
        'Formula: max = (CPU cores × 2) + spindle_count. For 4-core SSD: 9.',
    };
  }

  // GET /api/stats/tables
  @Get('tables')
  @HttpCode(HttpStatus.OK)
  async getTableStats() {
    // Table sizes including indexes
    const tables = await this.dataSource.query(`
      SELECT
        schemaname || '.' || tablename AS table_name,
        pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
        pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) AS data_size,
        pg_size_pretty(
          pg_total_relation_size(schemaname || '.' || tablename) -
          pg_relation_size(schemaname || '.' || tablename)
        ) AS index_size,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) AS estimated_rows
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
    `);

    return { tables };
  }

  // GET /api/stats/indexes
  @Get('indexes')
  @HttpCode(HttpStatus.OK)
  async getIndexStats() {
    // Index usage statistics
    const indexes = await this.dataSource.query(`
      SELECT
        schemaname || '.' || tablename AS table_name,
        indexrelname AS index_name,
        pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
        idx_scan AS scans,
        idx_tup_read AS tuples_read,
        idx_tup_fetch AS tuples_fetched
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC
    `);

    return {
      indexes,
      recommendation: 'Unused indexes (scans = 0) should be dropped to save write overhead.',
    };
  }
}
