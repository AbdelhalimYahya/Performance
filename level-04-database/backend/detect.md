# How to Detect Database Performance Problems

> A hands-on guide to finding and diagnosing PostgreSQL performance issues in Node.js backends using real tools, SQL queries, and ORM-specific techniques.

---

## 1. Database Performance Problem Types

### Query Latency

A single query takes too long to execute. Symptoms: high TTFB on specific API endpoints, p99 latency spikes, slow dashboard loads. Root cause: missing indexes, bad query plans, large result sets. Detected via: EXPLAIN ANALYZE, pg_stat_statements.

### Throughput Saturation

The database handles more queries per second than it can process. Symptoms: increasing response times under load, query queue buildup, CPU at 100% on DB server. Root cause: insufficient indexes, too many concurrent queries, missing connection pooling. Detected via: pg_stat_activity, connection count monitoring.

### Connection Exhaustion

All available connections are in use and new queries must wait. Symptoms: "too many clients already" error, connection timeout errors, application hangs. Root cause: connection leak, pool too small, long-running transactions. Detected via: pg_stat_activity, application connection pool metrics.

### Lock Contention

One transaction holds a lock that blocks other transactions. Symptoms: queries stuck in "idle in transaction", sudden throughput drop, deadlocks. Root cause: long-running writes, missing indexes on foreign keys, SELECT FOR UPDATE. Detected via: pg_locks, pg_stat_activity.

### Replication Lag

Read replicas are behind the primary. Symptoms: stale reads from replicas, inconsistent data between requests. Root cause: heavy write load, large transactions, slow replica I/O. Detected via: pg_stat_replication, pg_last_xact_replay_timestamp().

---

## 2. PostgreSQL EXPLAIN ANALYZE

### How to Use

```sql
EXPLAIN ANALYZE SELECT * FROM products WHERE category = 'electronics' AND price < 100;
```

### Sample Output and Annotation

```
Seq Scan on products  (cost=0.00..1250.00 rows=500 width=48) (actual time=0.015..12.340 rows=487 loops=1)
  Filter: ((category = 'electronics') AND (price < '100'::numeric))
  Rows Removed by Filter: 9513
Planning Time: 0.085 ms
Execution Time: 12.450 ms
```

| Line | Meaning |
|------|---------|
| `Seq Scan on products` | Full table scan — reads every row. Bad for large tables. |
| `cost=0.00..1250.00` | Estimated cost (startup..total). Planner's prediction. |
| `rows=500` | Estimated rows returned. If actual differs wildly, statistics are stale. |
| `width=48` | Estimated bytes per row. |
| `actual time=0.015..12.340` | Real timing in ms (startup..total). |
| `rows=487 loops=1` | Actual rows returned. `loops=1` means no nested iteration. |
| `Filter: ...` | Row-level filter applied after scan. |
| `Rows Removed by Filter: 9513` | Rows scanned but discarded — this is the waste. |
| `Planning Time: 0.085 ms` | Time to generate the query plan. |
| `Execution Time: 12.450 ms` | Total time including planning. |

### What Good Looks Like

```
Index Scan using idx_products_category_price on products
  (cost=0.29..45.20 rows=500 width=48) (actual time=0.025..0.890 rows=487 loops=1)
```

Index Scan = using an index. Actual time < estimated = planner is accurate.

---

## 3. Finding Slow Queries

### Install pg_stat_statements

```sql
-- In postgresql.conf: shared_preload_libraries = 'pg_stat_statements'
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

### Query for Top Slow Queries

```sql
-- Top 10 queries by total time
SELECT
  queryid,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(stddev_exec_time::numeric, 2) AS stddev_ms,
  rows,
  query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

### Query for Highest Mean Time

```sql
-- Queries with highest average execution time (at least 10 calls)
SELECT
  queryid,
  calls,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(max_exec_time::numeric, 2) AS max_ms,
  rows / NULLIF(calls, 0) AS avg_rows,
  LEFT(query, 100) AS query_preview
FROM pg_stat_statements
WHERE calls >= 10
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Reset Statistics

```sql
SELECT pg_stat_statements_reset();
```

---

## 4. Detecting Sequential Scans on Large Tables

### Check Sequential vs Index Scan Ratio

```sql
SELECT
  schemaname,
  relname AS table_name,
  seq_scan,
  idx_scan,
  CASE WHEN seq_scan + idx_scan > 0
    THEN round(100.0 * seq_scan / (seq_scan + idx_scan), 1)
    ELSE 0
  END AS seq_scan_pct,
  n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE n_live_tup > 10000
ORDER BY seq_scan_pct DESC
LIMIT 20;
```

### Interpretation

| seq_scan_pct | Assessment |
|--------------|------------|
| > 50% | Problem — table is frequently full-scanned |
| 20-50% | Investigate — some queries may need indexes |
| < 20% | Healthy — most queries use indexes |

### When Sequential Scan Is Fine

- Tables with < 10,000 rows (sequential scan is faster than index lookup)
- Queries that return > 10-20% of the table (sequential scan is more efficient)
- Tables with no useful indexes to use

---

## 5. N+1 Query Detection

### TypeORM Query Logging

```typescript
const AppDataSource = new DataSource({
  type: 'postgres',
  logging: ['query', 'slow', 'error'],
  logger: 'advanced-console',
});
```

Look for repeated identical queries with different parameter values:

```
QUERY: SELECT * FROM products WHERE id = $1 -- params: [1]
QUERY: SELECT * FROM products WHERE id = $1 -- params: [2]
QUERY: SELECT * FROM products WHERE id = $1 -- params: [3]
```

### Prisma Query Logging

```typescript
const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
  ],
});

prisma.$on('query', (e) => {
  console.log(`Query: ${e.query} Duration: ${e.duration}ms`);
});
```

### Count Queries Per Request

```typescript
// NestJS middleware to count queries per request
@Injectable()
export class QueryCountMiddleware implements NestMiddleware {
  use(req: any, res: Response, next: NextFunction) {
    const start = performance.now();
    let queryCount = 0;

    // Intercept database calls (implementation depends on ORM)
    const originalQuery = req.db?.query?.bind(req.db);
    if (originalQuery) {
      req.db.query = (...args: any[]) => {
        queryCount++;
        return originalQuery(...args);
      };
    }

    res.on('finish', () => {
      const duration = performance.now() - start;
      if (queryCount > 5) {
        console.warn(`[N+1 Warning] ${req.method} ${req.url}: ${queryCount} queries in ${duration.toFixed(0)}ms`);
      }
    });

    next();
  }
}
```

---

## 6. Connection Pool Exhaustion

### Query Active Connections

```sql
SELECT
  state,
  COUNT(*) AS count,
  MAX(EXTRACT(EPOCH FROM (now() - state_change)))::int AS max_duration_sec
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY count DESC;
```

### Find Long-Running Queries

```sql
SELECT
  pid,
  state,
  EXTRACT(EPOCH FROM (now() - query_start))::int AS duration_sec,
  LEFT(query, 80) AS query_preview
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start IS NOT NULL
ORDER BY query_start ASC
LIMIT 10;
```

### Detecting Pool Exhaustion from App Logs

```
Error: Cannot acquire connection from pool
Error: Timeout acquiring connection from pool
Error: too many clients already
```

These errors mean the pool is exhausted. Check: pool size vs max_connections, long-running transactions, connection leaks.

---

## 7. Lock Contention Detection

### Find Blocked Queries

```sql
SELECT
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query,
  blocking.pid AS blocking_pid,
  blocking.query AS blocking_query,
  EXTRACT(EPOCH FROM (now() - blocked.query_start))::int AS blocked_duration_sec
FROM pg_stat_activity AS blocked
JOIN pg_locks AS bl ON bl.pid = blocked.pid
JOIN pg_locks AS kl ON kl.locktype = bl.locktype
  AND kl.database IS NOT DISTINCT FROM bl.database
  AND kl.relation IS NOT DISTINCT FROM bl.relation
  AND kl.page IS NOT DISTINCT FROM bl.page
  AND kl.tuple IS NOT DISTINCT FROM bl.tuple
  AND kl.transactionid IS NOT DISTINCT FROM bl.transactionid
  AND kl.pid != bl.pid
JOIN pg_stat_activity AS blocking ON blocking.pid = kl.pid
WHERE NOT bl.granted;
```

### SELECT FOR UPDATE Impact

```sql
-- This locks the row until the transaction commits
BEGIN;
SELECT * FROM products WHERE id = 1 FOR UPDATE;
-- Other transactions waiting for this row are blocked
UPDATE products SET stock = stock - 1 WHERE id = 1;
COMMIT;
```

---

## 8. Index Bloat Detection

### Check Index Usage

```sql
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan AS times_used,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC
LIMIT 20;
```

Indexes with `idx_scan = 0` are unused — consider dropping them.

### Check Index Bloat

```sql
SELECT
  indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  round(100.0 * (pg_relation_size(indexrelid) - 
    (SELECT relpages * 8192 FROM pg_class WHERE oid = indexrelid)) / 
    NULLIF(pg_relation_size(indexrelid), 0), 1) AS bloat_pct
FROM pg_stat_user_indexes
WHERE pg_relation_size(indexrelid) > 1048576  -- > 1MB
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Dead Tuples Impact

```sql
SELECT
  relname,
  n_dead_tup,
  n_live_tup,
  CASE WHEN n_live_tup > 0
    THEN round(100.0 * n_dead_tup / n_live_tup, 1)
    ELSE 0
  END AS dead_pct,
  last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

---

## 9. Query Planning Problems

### Detect Stale Statistics

```sql
-- Check when tables were last analyzed
SELECT
  relname,
  last_analyze,
  last_autoanalyze,
  n_mod_since_analyze
FROM pg_stat_user_tables
WHERE n_mod_since_analyze > 10000
ORDER BY n_mod_since_analyze DESC;
```

If `n_mod_since_analyze` is high and `last_analyze` is old, statistics are stale. Run `ANALYZE table_name;`.

### Planning Time vs Execution Time

If planning time is > 10% of total time, the planner is spending too long. Check: too many JOINs, complex subqueries, missing statistics.

### Force a Plan with pg_hint_plan

```sql
-- Force index scan
/*+ IndexScan(products idx_products_category) */
SELECT * FROM products WHERE category = 'electronics';

-- Force hash join
/*+ HashJoin(orders users) */
SELECT * FROM orders JOIN users ON orders.user_id = users.id;
```

---

## 10. ORM-Specific Detection

### TypeORM Logging Configuration

```typescript
const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  logging: {
    query: true,        // log all queries
    error: true,        // log errors
    slow: true,         // log slow queries (> 1000ms)
    failedQueryError: true,
  },
  logger: 'advanced-console',
});
```

### Prisma Logging Configuration

```typescript
const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});

// Count queries per request
prisma.$on('query', (e) => {
  if (e.duration > 1000) {
    console.warn(`Slow query (${e.duration}ms): ${e.query.slice(0, 200)}`);
  }
});
```

### Detecting Over-Eager Loading

```typescript
// BAD: Loading entire entity graph
const users = await prisma.user.findMany({
  include: {
    posts: { include: { comments: { include: { author: true } } } },
  },
});

// Check query count: should be 1 (eager) or N+1 (lazy)
// If query count is 1 but response is huge → over-eager loading
```

---

## 11. Diagnostic Checklist

| # | Symptom | Likely Cause | Where to Look | What You Expect |
|---|---------|-------------|---------------|-----------------|
| 1 | TTFB > 1s on specific endpoint | Slow query | EXPLAIN ANALYZE on the query | Execution time < 100ms |
| 2 | p99 >> p50 (big gap) | Lock contention or cold cache | pg_locks + pg_stat_activity | No blocked queries |
| 3 | "too many clients" error | Connection pool exhaustion | pg_stat_activity state count | All states < max_connections |
| 4 | Sequential scan on large table | Missing index | pg_stat_user_tables seq_scan | idx_scan > seq_scan |
| 5 | Identical queries with different params | N+1 problem | ORM query logs | Batch query instead |
| 6 | High planning time | Stale statistics | pg_stat_user_tables last_analyze | ANALYZE within last hour |
| 7 | Unused indexes | Index bloat | pg_stat_user_indexes idx_scan | idx_scan > 0 |
| 8 | Dead tuples > 10% of live | Vacuum not running | pg_stat_user_tables n_dead_tup | last_autovacuum recent |
| 9 | Replication lag > 10s | Write overload | pg_stat_replication | lag < 1s |
| 10 | Long idle-in-transaction | Connection leak | pg_stat_activity WHERE state='idle in transaction' | duration < 60s |
| 11 | High CPU on DB server | Too many sequential scans | pg_stat_user_tables + top | Low seq_scan counts |
| 12 | Slow SELECT FOR UPDATE | Lock held too long | pg_locks + pg_stat_activity | Lock duration < 5s |
| 13 | Index bloat > 30% | Needs REINDEX | pgstatindex | bloat < 10% |
| 14 | Cache hit ratio < 95% | Insufficient shared_buffers | pg_stat_database | hit_ratio > 99% |
| 15 | Transactions per second dropping | Throughput saturation | pg_stat_database xact_commit | Stable or increasing |
| 16 | Checkpoint timeout warnings | WAL volume too high | pg_stat_bgwriter | checkpoints < 1 per hour |
| 17 | Lock wait timeout errors | Deadlock or long lock | pg_stat_activity + pg_locks | No wait timeout errors |
| 18 | Disk usage growing fast | WAL or temp files | pg_stat_bgwriter + disk stats | WAL size stable |
| 19 | Sequential index scans | Wrong index type | pg_stat_user_indexes + EXPLAIN | Index Scan not Seq Scan |
| 20 | Nested loop on large datasets | Wrong join strategy | EXPLAIN ANALYZE | Hash Join for large tables |
| 21 | Sort operations spilling to disk | work_mem too low | EXPLAIN (VERBOSE) | Sort Method: quicksort in memory |
| 22 | Hash operations spilling to disk | work_mem too low | EXPLAIN (VERBOSE) | Hash Method: pure hash |
| 23 | High temp file usage | Complex queries needing work_mem | pg_stat_database temp_files | temp_files = 0 |
| 24 | Commit latency > 10ms | fsync or WAL bottleneck | pg_stat_database xact_commit time | commit < 5ms |
| 25 | Connection count growing over time | Connection leak | Application pool metrics | Stable connection count |

---

> **Next:** See [fix.md](./fix.md) for solutions, or go to the project files in `./project/` for runnable implementations.
