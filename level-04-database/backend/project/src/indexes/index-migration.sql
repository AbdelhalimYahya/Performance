-- =============================================================================
-- Index Design Migration — Demonstrates production-safe index operations
-- =============================================================================
-- Key principles:
-- - CREATE INDEX CONCURRENTLY: non-blocking, allows reads/writes during build
-- - DROP INDEX CONCURRENTLY: non-blocking removal
-- - Always EXPLAIN before and after to verify impact
-- - Monitor long builds with pg_stat_progress_create_index
-- =============================================================================

-- ─── 1. Composite Index: category + price ──────────────────────
-- Supports: WHERE category = X ORDER BY price
-- Column order rule: equality first, then range, then sort
EXPLAIN ANALYZE
SELECT * FROM products WHERE category = 'electronics' AND price > 50 ORDER BY price;

-- Create (non-blocking for production)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category_price
  ON products (category, price);

-- Verify it's used
EXPLAIN ANALYZE
SELECT * FROM products WHERE category = 'electronics' AND price > 50 ORDER BY price;

-- ─── 2. Partial Index: active products only ────────────────────
-- Most queries filter by isActive = true (90% of rows)
-- Only index active products — skip the 10% inactive
EXPLAIN ANALYZE
SELECT * FROM products WHERE isActive = true AND category = 'electronics';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_active_category
  ON products (category, price)
  WHERE isActive = true;

-- Verify Index Scan (not Seq Scan)
EXPLAIN ANALYZE
SELECT * FROM products WHERE isActive = true AND category = 'electronics';

-- ─── 3. Expression Index: case-insensitive email ───────────────
-- Supports: WHERE LOWER(email) = X
-- Without this, PostgreSQL evaluates LOWER() on every row (Seq Scan)
EXPLAIN ANALYZE
SELECT * FROM users WHERE LOWER(email) = 'test@example.com';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_lower
  ON users (LOWER(email));

-- Verify it's used
EXPLAIN ANALYZE
SELECT * FROM users WHERE LOWER(email) = 'test@example.com';

-- ─── 4. Covering Index: avoid heap access ──────────────────────
-- Query only needs id, name, price — all in the index
-- INCLUDE adds columns to the index leaf without affecting sort order
EXPLAIN ANALYZE
SELECT id, name, price FROM products
WHERE category = 'electronics' AND price > 50
ORDER BY price;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_covering
  ON products (category, price)
  INCLUDE (id, name, stock);

-- Verify Index Only Scan (no heap access)
EXPLAIN ANALYZE
SELECT id, name, price FROM products
WHERE category = 'electronics' AND price > 50
ORDER BY price;

-- ─── 5. Cursor Pagination Index ────────────────────────────────
-- Supports: WHERE id > $cursor ORDER BY id LIMIT $limit
-- Always fast regardless of page depth (index seek, not scan)
EXPLAIN ANALYZE
SELECT * FROM products ORDER BY id LIMIT 20 OFFSET 100000;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_id_cursor
  ON products (id);

-- Verify Index Scan (not Seq Scan with OFFSET)
EXPLAIN ANALYZE
SELECT * FROM products WHERE id > 'some-cursor-id' ORDER BY id LIMIT 20;

-- ─── 6. Timestamp Index: time-based queries ────────────────────
-- Supports: WHERE created_at > X ORDER BY created_at
-- Useful for "recent items" and time-range reports
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_created_at
  ON products (created_at);

-- ─── 7. Check Index Usage ──────────────────────────────────────
-- Find indexes that are never scanned (candidates for removal)
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan AS scans,
  idx_tup_read AS tuples_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;

-- ─── 8. Monitor Long Index Builds ──────────────────────────────
-- If CREATE INDEX takes minutes, check progress:
SELECT
  p.pid,
  a.query,
  p.phase,
  p.blocks_total,
  p.blocks_done,
  ROUND(p.blocks_done::numeric / NULLIF(p.blocks_total, 0) * 100, 1) AS percent_done
FROM pg_stat_progress_create_index p
JOIN pg_stat_activity a ON p.pid = a.pid;

-- ─── 9. Drop Unused Indexes (non-blocking) ─────────────────────
-- Only drop indexes with zero scans (after confirming they're unused)
-- Always use CONCURRENTLY in production to avoid locking
-- DROP INDEX CONCURRENTLY IF EXISTS idx_unused_name;

-- ─── 10. Reindex After Dropping ────────────────────────────────
-- After dropping indexes, run ANALYZE to update planner statistics
ANALYZE products;
ANALYZE users;
