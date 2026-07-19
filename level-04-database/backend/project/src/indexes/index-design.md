# PostgreSQL Index Design Reference

> A practical guide to choosing the right index type, ordering composite columns, and designing for index-only scans.

---

## 1. Index Types — When to Use Each

### B-tree (Default)
The standard index. Works for equality (`=`), range (`<`, `>`, `<=`, `>=`), `LIKE 'prefix%'`, `IS NULL`, and `IN` queries.

```sql
CREATE INDEX idx_products_name ON products (name);
```

Use B-tree when:
- Column has high cardinality (many distinct values)
- Queries use equality or range operators
- You need排序 (ORDER BY) support

### GIN (Generalized Inverted Index)
Inverted index for composite types: arrays, full-text search vectors, JSONB.

```sql
-- Full-text search
CREATE INDEX idx_products_search ON products USING GIN (to_tsvector('english', name || ' ' || description));

-- JSONB containment
CREATE INDEX idx_products_attrs ON products USING GIN (attributes);
```

Use GIN when:
- Querying array containment (`@>`)
- Full-text search (`@@`)
- JSONB key/value lookup

### GiST (Generalized Search Tree)
Space-partitioning index for geometric data, ranges, and nearest-neighbor searches.

```sql
-- Range type (tsrange for time slots)
CREATE INDEX idx_events_period ON events USING GiST (during);

-- Nearest-neighbor with kNN
CREATE INDEX idx_locations_coords ON locations USING GiST (coordinates);
```

Use GiST when:
- Querying ranges (`@>`, `&&`, `<@`)
- Nearest-neighbor searches (`<->`)
- Geometric containment

### BRIN (Block Range Index)
Stores min/max per block range. Tiny index size for naturally ordered data.

```sql
-- Timestamp column that's inserted in order
CREATE INDEX idx_logs_created ON logs USING BRIN (created_at);
```

Use BRIN when:
- Table is large (>10M rows)
- Column values correlate with physical row order (insertion order)
- B-tree index would be too large
- Trade-off: less precise than B-tree, but ~1000x smaller

---

## 2. Composite Index Column Order

The order of columns in a composite index determines which queries can use it.

**Rule: equality columns first, then range, then sort.**

```sql
-- Query: WHERE category = 'electronics' AND price > 50 ORDER BY created_at
CREATE INDEX idx_composite ON products (category, price, created_at);
--         ^^^ equality   ^^^ range     ^^^ sort
```

Why this order works:
1. `category = 'electronics'` narrows to a specific subtree
2. `price > 50` further narrows within that subtree
3. `created_at` is already sorted within the (category, price) prefix

The index does NOT support:
- `WHERE price > 50` (skips equality column)
- `WHERE created_at > '2024-01-01'` (skips two columns)

---

## 3. Covering Indexes (INCLUDE Clause)

A covering index includes all columns the query needs, avoiding table heap access entirely.

```sql
-- Query only needs id, name, price from the index
CREATE INDEX idx_products_covering ON products (category, price)
  INCLUDE (id, name, stock);

-- This query is satisfied entirely from the index (Index Only Scan)
SELECT id, name, price FROM products
WHERE category = 'electronics' AND price > 50;
```

Without INCLUDE, PostgreSQL must visit the heap (table) to fetch `id`, `name`, `stock`.
With INCLUDE, the index contains everything → zero heap reads.

**When to use INCLUDE:**
- Queries select a small, fixed set of columns
- The WHERE clause already uses the index's leading columns
- The table is large and heap access is expensive

---

## 4. Partial Indexes

Index only rows matching a WHERE condition. Smaller index = faster scans.

```sql
-- Most queries filter by isActive = true (90% of rows)
-- Only index active products — skip the 10% inactive
CREATE INDEX idx_products_active ON products (category, price)
  WHERE isActive = true;

-- Only index unpaid orders (hot query path)
CREATE INDEX idx_orders_pending ON orders (user_id, created_at)
  WHERE status = 'pending';
```

Benefits:
- Index is 10-90% smaller than a full index
- Faster to scan, less WAL generated
- Faster to rebuild (VACUUM, REINDEX)

**When to use partial indexes:**
- Queries consistently filter by a fixed condition
- The condition eliminates a significant portion of rows
- The table is large

---

## 5. Expression Indexes

Index the result of a function for function-based lookups.

```sql
-- Case-insensitive email lookup
CREATE INDEX idx_users_email_lower ON users (LOWER(email));

-- Query now uses the index
SELECT * FROM users WHERE LOWER(email) = 'test@example.com';

-- Year extraction for annual reports
CREATE INDEX idx_orders_year ON orders (EXTRACT(YEAR FROM created_at));
```

Without the expression index, PostgreSQL must evaluate the function on every row (Seq Scan).
With the expression index, the function result is pre-computed and indexed.

---

## 6. Index-Only Scans

An Index-Only Scan reads data entirely from the index without touching the table heap.

**Requirements for Index-Only Scan:**
1. All columns in the SELECT are in the index (or INCLUDE)
2. All columns in the WHERE are in the index
3. The visibility map is up-to-date (VACUUM must run)

```sql
-- Check if visibility map is current
SELECT relname, last_vacuum, last_autovacuum,
       last_autoanalyze, reltuples::bigint
FROM pg_stat_user_tables
WHERE relname = 'products';

-- Force visibility map update
VACUUM products;
```

**Design for Index-Only Scans:**
1. Create a composite index with leading columns for WHERE
2. INCLUDE non-leading columns needed by SELECT
3. Run VACUUM regularly to keep visibility map current

```sql
-- Products query: WHERE category = X ORDER BY price
-- SELECT id, name, price
CREATE INDEX idx_products_ios ON products (category, price) INCLUDE (id, name);
VACUUM products; -- update visibility map
```

---

## Summary

| Index Type | Best For | Size | Speed |
|-----------|----------|------|-------|
| B-tree | Equality, range, sort | Medium | Fast |
| GIN | Arrays, JSONB, FTS | Large | Medium |
| GiST | Ranges, kNN, geometry | Medium | Medium |
| BRIN | Large ordered tables | Tiny | Slow-ish |
| Partial | Filtered queries | Small | Fast |
| Expression | Function-based lookups | Medium | Fast |
| Covering | Avoid heap access | Large | Fastest |
