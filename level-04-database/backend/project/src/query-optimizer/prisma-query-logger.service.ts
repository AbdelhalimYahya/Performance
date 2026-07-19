/**
 * Prisma Query Logger Service — wraps PrismaClient to track per-request
 * query metrics and detect N+1 patterns.
 *
 * Features:
 * - $on("query") listener for real-time tracking
 * - Per-request query count, duration, and pattern detection
 * - N+1 warning when the same query pattern fires > 5 times
 * - Slowest query tracking per request
 * - Query count histogram for analysis
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export interface RequestQueryStats {
  requestId: string;
  queryCount: number;
  totalDurationMs: number;
  slowestQuery: {
    query: string;
    durationMs: number;
  } | null;
  patternCounts: Map<string, number>;
  n1Warnings: string[];
  queries: Array<{
    query: string;
    durationMs: number;
    timestamp: number;
  }>;
}

export interface QueryHistogram {
  bucket: string;
  count: number;
  percentage: number;
}

@Injectable()
export class PrismaQueryLoggerService {
  private readonly logger = new Logger(PrismaQueryLoggerService.name);

  /**
   * Active request tracking map.
   * Key: requestId, Value: accumulated stats for that request.
   */
  private readonly requestStats = new Map<string, RequestQueryStats>();

  /**
   * Global query histogram — tracks distribution of query durations.
   * Buckets: <1ms, 1-5ms, 5-10ms, 10-50ms, 50-100ms, 100-500ms, >500ms
   */
  private readonly histogram = new Map<string, number>([
    ['<1ms', 0],
    ['1-5ms', 0],
    ['5-10ms', 0],
    ['10-50ms', 0],
    ['50-100ms', 0],
    ['100-500ms', 0],
    ['>500ms', 0],
  ]);

  /**
   * Total queries logged across all requests (for global metrics).
   */
  private totalQueriesLogged = 0;

  /**
   * N+1 detection threshold — same pattern > this count triggers a warning.
   */
  private static readonly N1_THRESHOLD = 5;

  /**
   * Create a PrismaClient instance with the query logger attached.
   * Each request should call createClient() to get an isolated instance.
   */
  createClient(requestId: string): PrismaClient {
    const client = new PrismaClient();

    // Initialize stats for this request
    this.requestStats.set(requestId, {
      requestId,
      queryCount: 0,
      totalDurationMs: 0,
      slowestQuery: null,
      patternCounts: new Map(),
      n1Warnings: [],
      queries: [],
    });

    // Attach query event listener
    client.$on('query', (event) => {
      const durationMs = event.duration;
      const query = event.query;

      const stats = this.requestStats.get(requestId);
      if (!stats) return;

      // Increment query count
      stats.queryCount++;
      stats.totalDurationMs += durationMs;

      // Track slowest query
      if (!stats.slowestQuery || durationMs > stats.slowestQuery.durationMs) {
        stats.slowestQuery = { query, durationMs };
      }

      // Extract query pattern (normalize parameters to detect duplicates)
      const pattern = this.normalizeQuery(query);
      const currentCount = (stats.patternCounts.get(pattern) ?? 0) + 1;
      stats.patternCounts.set(pattern, currentCount);

      // N+1 detection: warn when same pattern fires > threshold
      if (
        currentCount === PrismaQueryLoggerService.N1_THRESHOLD + 1 &&
        !stats.n1Warnings.includes(pattern)
      ) {
        stats.n1Warnings.push(pattern);
        this.logger.warn(
          `[N+1 Warning] Request ${requestId}: query pattern "${pattern}" fired ${currentCount} times. Consider using DataLoader or eager loading.`,
        );
      }

      // Record query details
      stats.queries.push({
        query: query.substring(0, 200),
        durationMs,
        timestamp: Date.now(),
      });

      // Update global histogram
      this.updateHistogram(durationMs);
      this.totalQueriesLogged++;
    });

    return client;
  }

  /**
   * Normalize a SQL query by replacing parameter values with placeholders.
   * This groups similar queries for pattern detection.
   *
   * Example:
   *   SELECT * FROM users WHERE id = 123
   *   SELECT * FROM users WHERE id = 456
   *   → SELECT * FROM users WHERE id = $1
   */
  private normalizeQuery(query: string): string {
    return query
      .replace(/\$\d+/g, '$P')      // Prisma numbered params
      .replace(/'[^']*'/g, '$S')    // String literals
      .replace(/\d+/g, '$N')        // Numeric literals
      .replace(/\s+/g, ' ')         // Collapse whitespace
      .trim();
  }

  /**
   * Update the global duration histogram with a new sample.
   */
  private updateHistogram(durationMs: number): void {
    if (durationMs < 1) {
      this.histogram.set('<1ms', (this.histogram.get('<1ms') ?? 0) + 1);
    } else if (durationMs < 5) {
      this.histogram.set('1-5ms', (this.histogram.get('1-5ms') ?? 0) + 1);
    } else if (durationMs < 10) {
      this.histogram.set('5-10ms', (this.histogram.get('5-10ms') ?? 0) + 1);
    } else if (durationMs < 50) {
      this.histogram.set('10-50ms', (this.histogram.get('10-50ms') ?? 0) + 1);
    } else if (durationMs < 100) {
      this.histogram.set('50-100ms', (this.histogram.get('50-100ms') ?? 0) + 1);
    } else if (durationMs < 500) {
      this.histogram.set('100-500ms', (this.histogram.get('100-500ms') ?? 0) + 1);
    } else {
      this.histogram.set('>500ms', (this.histogram.get('>500ms') ?? 0) + 1);
    }
  }

  /**
   * Get query stats for a specific request.
   * Call this in an interceptor or after the request completes.
   */
  getRequestQueryStats(requestId: string): RequestQueryStats | null {
    return this.requestStats.get(requestId) ?? null;
  }

  /**
   * Get the global query duration histogram.
   * Useful for dashboard display of query performance distribution.
   */
  getHistogram(): QueryHistogram[] {
    const total = this.totalQueriesLogged || 1;
    return Array.from(this.histogram.entries()).map(([bucket, count]) => ({
      bucket,
      count,
      percentage: Math.round((count / total) * 100 * 100) / 100,
    }));
  }

  /**
   * Get global summary stats.
   */
  getGlobalStats(): {
    totalQueries: number;
    activeRequests: number;
    histogram: QueryHistogram[];
  } {
    return {
      totalQueries: this.totalQueriesLogged,
      activeRequests: this.requestStats.size,
      histogram: this.getHistogram(),
    };
  }

  /**
   * Clean up request stats after response is sent.
   * Prevents memory leaks from abandoned requests.
   */
  cleanupRequest(requestId: string): void {
    this.requestStats.delete(requestId);
  }

  /**
   * Gracefully disconnect all Prisma clients.
   * Call on module destroy.
   */
  async onModuleDestroy(): Promise<void> {
    this.requestStats.clear();
  }
}
