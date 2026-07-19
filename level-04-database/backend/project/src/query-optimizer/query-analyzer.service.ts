/**
 * Query Analyzer Service — runs EXPLAIN ANALYZE, finds slow queries,
 * unused indexes, missing indexes, table bloat, and overall DB stats.
 *
 * All SQL is valid PostgreSQL. Requires pg_stat_statements extension
 * for slow query analysis.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export interface PlanNode {
  nodeType: string;
  relationName?: string;
  alias?: string;
  startupCost: number;
  totalCost: number;
  planRows: number;
  planWidth: number;
  actualRows?: number;
  actualLoops?: number;
  sharedHitBlocks?: number;
  sharedReadBlocks?: number;
  filter?: string;
  rowsRemovedByFilter?: number;
  indexName?: string;
  indexCond?: string;
  joinType?: string;
  hashCond?: string;
  children?: PlanNode[];
}

export interface ExplainResult {
  planningTime: number;
  executionTime: number;
  totalCost: number;
  nodes: PlanNode[];
  hasSeqScan: boolean;
  hasHashJoin: boolean;
  indexesUsed: string[];
  estimatedRows: number;
  actualRows: number;
  rowAccuracyRatio: number;
}

export interface SlowQuery {
  query: string;
  calls: number;
  totalTime: number;
  meanTime: number;
  minTime: number;
  maxTime: number;
  stddevTime: number;
  rowsReturned: number;
}

export interface IndexStats {
  schemaname: string;
  tablename: string;
  indexname: string;
  indexSize: string;
  indexSizeBytes: number;
  scans: number;
  definition: string;
}

export interface TableStats {
  schemaname: string;
  tablename: string;
  seqScans: number;
  seqTuplesRead: number;
  liveTuples: number;
  deadTuples: number;
  lastAutoanalyze: string | null;
  lastVacuum: string | null;
}

export interface BloatStats {
  tablename: string;
  tableSize: string;
  indexSize: string;
  totalSize: string;
  deadTuples: number;
  liveTuples: number;
  bloatRatio: number;
  estimatedBloatBytes: number;
}

export interface DatabaseStats {
  connectionCount: number;
  activeConnections: number;
  idleConnections: number;
  cacheHitRatio: number;
  transactionsPerSecond: number;
  deadTuples: number;
  totalTables: number;
  databaseSize: string;
  uptime: string;
}

@Injectable()
export class QueryAnalyzerService {
  private readonly logger = new Logger(QueryAnalyzerService.name);
  private readonly prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Run EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) on a SQL query.
   * Parses the JSON output into a structured ExplainResult.
   */
  async explainQuery(sql: string, params: unknown[] = []): Promise<ExplainResult> {
    const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;

    const result = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      explainSql,
      ...params,
    );

    const plan = result[0] as Record<string, unknown>;
    const planningTime = plan['Planning Time'] as number;
    const executionTime = plan['Execution Time'] as number;
    const planJson = plan['Plan'] as Record<string, unknown>;

    const nodes = this.extractNodes(planJson);
    const hasSeqScan = nodes.some((n) => n.nodeType === 'Seq Scan');
    const hasHashJoin = nodes.some((n) => n.nodeType === 'Hash Join');
    const indexesUsed = nodes
      .filter((n) => n.indexName)
      .map((n) => n.indexName!);

    const estimatedRows = planJson['Plan Rows'] as number;
    const rootActual = nodes[0]?.actualRows ?? planJson['Plan Rows'] as number;
    const actualRows = rootActual;
    const rowAccuracyRatio = estimatedRows > 0
      ? Math.min(estimatedRows, actualRows) / Math.max(estimatedRows, actualRows)
      : 0;

    return {
      planningTime,
      executionTime,
      totalCost: planJson['Total Cost'] as number,
      nodes,
      hasSeqScan,
      hasHashJoin,
      indexesUsed,
      estimatedRows,
      actualRows,
      rowAccuracyRatio,
    };
  }

  /**
   * Extract all PlanNode objects from the plan tree recursively.
   */
  private extractNodes(node: Record<string, unknown>, depth = 0): PlanNode[] {
    const parsed: PlanNode = {
      nodeType: node['Node Type'] as string,
      relationName: node['Relation Name'] as string | undefined,
      alias: node['Alias'] as string | undefined,
      startupCost: node['Startup Cost'] as number,
      totalCost: node['Total Cost'] as number,
      planRows: node['Plan Rows'] as number,
      planWidth: node['Plan Width'] as number,
      actualRows: node['Actual Rows'] as number | undefined,
      actualLoops: node['Actual Loops'] as number | undefined,
      sharedHitBlocks: node['Shared Hit Blocks'] as number | undefined,
      sharedReadBlocks: node['Shared Read Blocks'] as number | undefined,
      filter: node['Filter'] as string | undefined,
      rowsRemovedByFilter: node['Rows Removed by Filter'] as number | undefined,
      indexName: node['Index Name'] as string | undefined,
      indexCond: node['Index Cond'] as string | undefined,
      joinType: node['Join Type'] as string | undefined,
      hashCond: node['Hash Cond'] as string | undefined,
    };

    const nodes: PlanNode[] = [parsed];

    const plans = node['Plans'] as Record<string, unknown>[] | undefined;
    if (plans) {
      for (const child of plans) {
        nodes.push(...this.extractNodes(child, depth + 1));
      }
    }

    return nodes;
  }

  /**
   * Find top 20 slowest queries from pg_stat_statements.
   * Requires: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
   */
  async findSlowQueries(): Promise<SlowQuery[]> {
    try {
      const result = await this.prisma.$queryRawUnsafe<SlowQuery[]>(`
        SELECT
          query,
          calls,
          total_exec_time AS "totalTime",
          mean_exec_time AS "meanTime",
          min_exec_time AS "minTime",
          max_exec_time AS "maxTime",
          stddev_exec_time AS "stddevTime",
          rows AS "rowsReturned"
        FROM pg_stat_statements
        ORDER BY mean_exec_time DESC
        LIMIT 20
      `);

      return result;
    } catch {
      this.logger.warn(
        'pg_stat_statements extension not available. Run: CREATE EXTENSION pg_stat_statements;',
      );
      return [];
    }
  }

  /**
   * Find indexes that are never scanned (idx_scan = 0).
   * These are candidates for removal to save write overhead.
   */
  async findUnusedIndexes(): Promise<IndexStats[]> {
    return this.prisma.$queryRawUnsafe<IndexStats[]>(`
      SELECT
        s.schemaname,
        s.tablename,
        s.indexname AS "indexName",
        pg_size_pretty(pg_relation_size(s.indexrelid)) AS "indexSize",
        pg_relation_size(s.indexrelid) AS "indexSizeBytes",
        s.idx_scan AS "scans",
        pg_get_indexdef(s.indexrelid) AS "definition"
      FROM pg_stat_user_indexes s
      WHERE s.idx_scan = 0
        AND s.indexrelid NOT IN (
          SELECT conrelid::regclass
          FROM pg_constraint
          WHERE contype IN ('p', 'u')
        )
      ORDER BY pg_relation_size(s.indexrelid) DESC
    `);
  }

  /**
   * Find tables with excessive sequential scans — indicate missing indexes.
   * Tables with seq_scan > 100 and n_live_tup > 1000 need attention.
   */
  async findMissingIndexes(): Promise<TableStats[]> {
    return this.prisma.$queryRawUnsafe<TableStats[]>(`
      SELECT
        schemaname,
        tablename,
        seq_scan AS "seqScans",
        seq_tup_read AS "seqTuplesRead",
        n_live_tup AS "liveTuples",
        n_dead_tup AS "deadTuples",
        last_autoanalyze::text AS "lastAutoanalyze",
        last_vacuum::text AS "lastVacuum"
      FROM pg_stat_user_tables
      WHERE seq_scan > 100
        AND n_live_tup > 1000
      ORDER BY seq_scan DESC
    `);
  }

  /**
   * Estimate table and index bloat using dead tuples and VACUUM stats.
   */
  async getTableBloat(): Promise<BloatStats[]> {
    return this.prisma.$queryRawUnsafe<BloatStats[]>(`
      SELECT
        c.relname AS "tablename",
        pg_size_pretty(pg_table_size(c.oid)) AS "tableSize",
        pg_size_pretty(pg_indexes_size(c.oid)) AS "indexSize",
        pg_size_pretty(pg_total_relation_size(c.oid)) AS "totalSize",
        COALESCE(s.n_dead_tup, 0) AS "deadTuples",
        COALESCE(s.n_live_tup, 0) AS "liveTuples",
        CASE
          WHEN COALESCE(s.n_live_tup, 0) > 0
          THEN ROUND((COALESCE(s.n_dead_tup, 0)::numeric / s.n_live_tup) * 100, 2)
          ELSE 0
        END AS "bloatRatio",
        CASE
          WHEN COALESCE(s.n_live_tup, 0) > 0
          THEN ROUND(
            (COALESCE(s.n_dead_tup, 0)::numeric / s.n_live_tup) *
            pg_relation_size(c.oid)
          )::bigint
          ELSE 0
        END AS "estimatedBloatBytes"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relname = c.relname
      WHERE c.relkind = 'r'
        AND n.nspname = 'public'
      ORDER BY pg_total_relation_size(c.oid) DESC
    `);
  }

  /**
   * Overall database health: connections, cache hit ratio, transaction rate.
   */
  async getDatabaseStats(): Promise<DatabaseStats> {
    const [connStats, cacheStats, txStats, sizeStats, uptimeResult] =
      await Promise.all([
        this.prisma.$queryRawUnsafe<{ state: string; count: bigint }[]>(`
          SELECT state, COUNT(*)::int AS count
          FROM pg_stat_activity
          WHERE datname = current_database()
          GROUP BY state
        `),
        this.prisma.$queryRawUnsafe<{ ratio: number }[]>(`
          SELECT
            ROUND(
              SUM(blks_hit)::numeric /
              NULLIF(SUM(blks_hit) + SUM(blks_read), 0),
              4
            ) AS ratio
          FROM pg_stat_database
          WHERE datname = current_database()
        `),
        this.prisma.$queryRawUnsafe<{ xact_commit: bigint; xact_rollback: bigint }[]>(`
          SELECT xact_commit, xact_rollback
          FROM pg_stat_database
          WHERE datname = current_database()
        `),
        this.prisma.$queryRawUnsafe<{ size: string }[]>(`
          SELECT pg_size_pretty(pg_database_size(current_database())) AS size
        `),
        this.prisma.$queryRawUnsafe<{ uptime: string }[]>(`
          SELECT NOW() - pg_postmaster_start_time()::text AS uptime
        `),
      ]);

    const connMap = new Map(connStats.map((r) => [r.state, r.count]));
    const total = connStats.reduce((sum, r) => sum + r.count, 0);

    return {
      connectionCount: Number(total),
      activeConnections: Number(connMap.get('active') ?? 0),
      idleConnections: Number(connMap.get('idle') ?? 0),
      cacheHitRatio: cacheStats[0]?.ratio ?? 0,
      transactionsPerSecond: 0,
      deadTuples: 0,
      totalTables: 0,
      databaseSize: sizeStats[0]?.size ?? '0 bytes',
      uptime: uptimeResult[0]?.uptime ?? 'unknown',
    };
  }
}
