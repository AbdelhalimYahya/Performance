# How to Fix Database Performance Problems

> Production-ready solutions for PostgreSQL + Node.js performance. Every SQL example is valid PostgreSQL. All ORM code is TypeScript.

---

## 1. Index Design Fundamentals

### When to Add an Index

Add an index when:
- A column is used in WHERE clauses frequently
- A column is used in JOIN conditions
- A column is used in ORDER BY and the query is slow
- The table has > 10,000 rows and the query scans a small fraction

### When NOT to Add an Index

- Write-heavy tables where every INSERT/UPDATE pays the index maintenance cost
- Small tables (< 10,000 rows) — sequential scan is faster
- Columns with low cardinality (e.g. boolean) unless combined with other columns

### Composite Index Column Order (Selectivity Rule)

Put the most selective column first. The index works left-to-right.

```sql
-- Good: category has higher selectivity than is_active
CREATE INDEX idx_products_category_active ON products (category, is_active);

-- This index supports: WHERE category = 'electronics'
-- This index supports: WHERE category = 'electronics' AND is_active = true
-- This index does NOT support: WHERE is_active = true (left column skipped)
```

### Partial Indexes

Index only rows matching a condition. Smaller index = faster scans.

```sql
-- Only index active products (most queries filter by is_active = true)
CREATE INDEX idx_products_active ON products (id, name, price)
  WHERE is_active = true;

-- Only index unpaid orders (hot query path)
CREATE INDEX idx_orders_unpaid ON orders (user_id, created_at)
  WHERE status = 'pending';
```

### Expression Indexes

Index the result of a function. Useful for case-insensitive search.

```sql
-- Case-insensitive email lookup
CREATE INDEX idx_users_email_lower ON users (LOWER(email));

-- Year extraction for annual reports
CREATE INDEX idx_orders_year ON orders (EXTRACT(YEAR FROM created_at));
```

---

## 2. Fixing N+1 Queries

### Strategy 1: Eager Loading

**TypeORM — Relations:**

```typescript
// TypeORM: load product with relations in one query
const products = await productRepository.find({
  relations: ['category', 'reviews', 'seller'],
  where: { isActive: true },
});
```

**Prisma — Include:**

```typescript
// Prisma: include nested relations
const products = await prisma.product.findMany({
  where: { isActive: true },
  include: {
    category: true,
    reviews: { take: 5, orderBy: { createdAt: 'desc' } },
    seller: { select: { name: true, rating: true } },
  },
});
```

### Strategy 2: DataLoader Pattern

Collect individual IDs over one tick, send one batch query.

```typescript
import DataLoader from 'dataloader';

// Batch function: receives [id1, id2, id3], returns [user1, user2, user3]
const userLoader = new DataLoader(async (ids: readonly string[]) => {
  const users = await userRepository.findBy({ id: In([...ids]) });
  const userMap = new Map(users.map((u) => [u.id, u]));
  return ids.map((id) => userMap.get(id) ?? new Error(`User ${id} not found`));
});

// Usage: each call is deduplicated automatically
const user1 = await userLoader.load('user-1');
const user2 = await userLoader.load('user-2');
// Only one SQL query: SELECT * FROM users WHERE id IN ('user-1', 'user-2')
```

### Strategy 3: JOIN Queries

```typescript
// Raw SQL JOIN — fastest for read-heavy paths
const results = await dataSource.query(`
  SELECT p.*, c.name AS category_name, u.name AS seller_name
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN users u ON u.id = p.seller_id
  WHERE p.is_active = true
  ORDER BY p.created_at DESC
  LIMIT 50
`);
```

### Strategy 4: Denormalization

Store redundant data to avoid JOINs entirely.

```sql
-- Add seller_name directly to products table
ALTER TABLE products ADD COLUMN seller_name VARCHAR(255);
-- Update on seller change (trigger or application logic)
```

Use when: read performance is critical and writes are infrequent.

---

## 3. Query Optimization Techniques

### Avoid SELECT *

```sql
-- BAD: transfers all columns including large text/blob fields
SELECT * FROM products WHERE category = 'electronics';

-- GOOD: select only what you need
SELECT id, name, price, category FROM products WHERE category = 'electronics';
```

### Covering Indexes

An index that contains all columns needed by the query — no table lookup required.

```sql
-- Query: SELECT name, price FROM products WHERE category = 'electronics'
-- Covering index includes all three columns
CREATE INDEX idx_products_covering ON products (category, name, price);

-- The query is satisfied entirely from the index (Index Only Scan)
```

### Push Filtering to the Database

```typescript
// BAD: fetch all products, filter in JavaScript
const allProducts = await productRepository.find();
const filtered = allProducts.filter((p) => p.price < 100);

// GOOD: filter in the database
const filtered = await productRepository.find({
  where: { price: LessThan(100) },
});
```

### Avoid Functions on Indexed Columns

```sql
-- BAD: function on indexed column prevents index usage
SELECT * FROM users WHERE LOWER(email) = 'test@example.com';

-- GOOD: use an expression index (see Section 1)
CREATE INDEX idx_users_email_lower ON users (LOWER(email));
SELECT * FROM users WHERE LOWER(email) = 'test@example.com';
```

### Avoid OFFSET at Scale

```sql
-- BAD: OFFSET scans and discards rows
SELECT * FROM products ORDER BY id OFFSET 100000 LIMIT 20;

-- GOOD: cursor-based (see Section 4)
SELECT * FROM products WHERE id > 100000 ORDER BY id LIMIT 20;
```

---

## 4. Cursor-based Pagination in SQL

### Basic Cursor Pagination

```sql
-- First page
SELECT id, name, price FROM products ORDER BY id LIMIT 20;

-- Next page (cursor = last id from previous page)
SELECT id, name, price FROM products
WHERE id > $cursor
ORDER BY id
LIMIT 20;
```

### Encoding Cursors (Base64)

```typescript
// Encode: composite key → base64
function encodeCursor(id: number, createdAt: string): string {
  return Buffer.from(JSON.stringify({ id, createdAt })).toString('base64url');
}

// Decode: base64 → composite key
function decodeCursor(cursor: string): { id: number; createdAt: string } {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString());
}

// Usage in query
const cursor = decodeCursor(req.query.cursor as string);
const products = await dataSource.query(`
  SELECT id, name, price, created_at FROM products
  WHERE (created_at, id) > ($1, $2)
  ORDER BY created_at, id
  LIMIT 20
`, [cursor.createdAt, cursor.id]);
```

### Multi-Column Sort Cursors

```sql
-- Sort by (created_at DESC, id ASC) — cursor holds both values
SELECT id, name, created_at FROM products
WHERE (created_at, id) < ($cursor_created_at, $cursor_id)
ORDER BY created_at DESC, id ASC
LIMIT 20;
```

---

## 5. Connection Pool Tuning

### pg Pool Settings

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  min: 5,                      // minimum idle connections
  max: 20,                     // maximum connections
  idleTimeoutMillis: 30000,    // close idle connections after 30s
  connectionTimeoutMillis: 5000, // fail if can't connect in 5s
  maxUses: 7500,               // recycle connections after 7500 queries
});
```

### Max Connections Formula

```
max = (CPU cores × 2) + effective_spindle_count
```

For a 4-core server with SSD: `(4 × 2) + 1 = 9`. For 8 cores: `(8 × 2) + 1 = 17`.

More connections is NOT always faster. PostgreSQL uses process-per-connection. Each process consumes ~10MB RAM. 100 connections = ~1GB RAM just for connections.

### Why Fewer Connections Is Better

- Context switching between processes is expensive
- Each connection holds memory (work_mem, temp buffers)
- Lock contention increases with more concurrent queries
- Use a pooler (PgBouncer) for thousands of connections

---

## 6. Read Replicas

### TypeORM Replication Config

```typescript
const AppDataSource = new DataSource({
  type: 'postgres',
  replication: {
    master: {
      host: 'primary-db',
      port: 5432,
      database: 'mydb',
      username: 'app',
      password: 'secret',
    },
    slaves: [
      {
        host: 'replica-1',
        port: 5432,
        database: 'mydb',
        username: 'app_readonly',
        password: 'secret',
      },
    ],
  },
});
```

### Prisma with $replica() Extension

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient().$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query, operation }) {
        // Route reads to replica, writes to primary
        if (operation === 'findMany' || operation === 'findFirst' || operation === 'findUnique') {
          // Use replica via $queryRawUnsafe or custom routing
        }
        return query(args);
      },
    },
  },
});
```

### Read vs Write Routing Rules

| Operation | Route | Reason |
|-----------|-------|--------|
| SELECT | Replica | Read-only, load balance |
| INSERT | Primary | Must be consistent |
| UPDATE | Primary | Must be consistent |
| DELETE | Primary | Must be consistent |
| SELECT FOR UPDATE | Primary | Needs row lock |

---

## 7. Query Batching and DataLoader

### DataLoader in NestJS

```typescript
import { Injectable, Scope } from '@nestjs/common';
import DataLoader from 'dataloader';

@Injectable({ scope: Scope.REQUEST })
export class UserLoader {
  private loader: DataLoader<string, User>;

  constructor(private readonly userRepository: UserRepository) {
    this.loader = new DataLoader(async (ids: readonly string[]) => {
      const users = await this.userRepository.findBy({ id: In([...ids]) });
      const map = new Map(users.map((u) => [u.id, u]));
      return ids.map((id) => map.get(id) ?? new Error(`User ${id} not found`));
    });
  }

  load(id: string): Promise<User> {
    return this.loader.load(id);
  }
}
```

### Request-Scoped Provider

```typescript
@Module({
  providers: [UserLoader],
})
export class UserModule {}
```

Each request gets its own DataLoader instance. The batch function runs once per event loop tick, collecting all `.load()` calls within that tick.

---

## 8. Materialized Views

### When to Use

Use materialized views for:
- Expensive aggregation queries (reports, dashboards)
- Complex JOINs that run frequently
- Data that can be slightly stale (minutes, not seconds)

### Create and Query

```sql
-- Create materialized view
CREATE MATERIALIZED VIEW mv_product_stats AS
SELECT
  category,
  COUNT(*) AS product_count,
  AVG(price) AS avg_price,
  SUM(stock) AS total_stock
FROM products
WHERE is_active = true
GROUP BY category;

-- Query like a normal table
SELECT * FROM mv_product_stats ORDER BY avg_price DESC;

-- Refresh (blocks reads during refresh)
REFRESH MATERIALIZED VIEW mv_product_stats;

-- Refresh concurrently (allows reads during refresh — needs UNIQUE index)
CREATE UNIQUE INDEX idx_mv_product_stats_category ON mv_product_stats (category);
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_stats;
```

### Schedule Refresh with pg_cron

```sql
-- Install pg_cron extension
CREATE EXTENSION pg_cron;

-- Refresh every 5 minutes
SELECT cron.schedule(
  'refresh-product-stats',
  '*/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_stats'
);
```

---

## 9. Bulk Operations

### Bulk INSERT with INSERT ... SELECT

```sql
-- Insert 10,000 rows in one query
INSERT INTO products (name, category, price, stock)
SELECT
  'Product ' || g,
  'category-' || (g % 10),
  (random() * 500)::numeric(10,2),
  (random() * 100)::int
FROM generate_series(1, 10000) g;
```

### Bulk INSERT with VALUES

```sql
-- Insert multiple rows in one statement
INSERT INTO products (name, price) VALUES
  ('Product A', 99.99),
  ('Product B', 149.99),
  ('Product C', 199.99);
```

### Bulk UPDATE with VALUES List

```sql
-- Update multiple rows efficiently
UPDATE products AS p
SET price = v.new_price
FROM (VALUES
  ('prod-1', 89.99),
  ('prod-2', 129.99),
  ('prod-3', 159.99)
) AS v(id, new_price)
WHERE p.id = v.id;
```

### Bulk DELETE

```sql
-- Delete multiple rows by ID list
DELETE FROM products WHERE id = ANY(ARRAY['prod-1', 'prod-2', 'prod-3']);

-- Or with IN
DELETE FROM products WHERE id IN ('prod-1', 'prod-2', 'prod-3');
```

---

## 10. Query Result Caching Strategy

### What to Cache

| Query Type | Cache? | TTL | Reason |
|-----------|--------|-----|--------|
| Product list (popular) | Yes | 5 min | Expensive, rarely changes |
| Dashboard aggregations | Yes | 1 min | Heavy computation |
| Category tree | Yes | 1 hour | Changes very rarely |
| Search results | Yes | 2 min | Expensive full-text search |
| User profile | No | — | User-sensitive |
| Order status | No | — | Real-time |
| Inventory count | No | — | Changes on every purchase |
| Admin audit logs | No | — | Must be current |

### TTL Strategy Per Query Type

```typescript
const CACHE_TTL = {
  PRODUCT_LIST: 300,        // 5 minutes — moderately fresh
  PRODUCT_DETAIL: 600,      // 10 minutes — rarely changes
  CATEGORY_TREE: 3600,      // 1 hour — very stable
  DASHBOARD_STATS: 60,      // 1 minute — semi-dynamic
  SEARCH_RESULTS: 120,      // 2 minutes — expensive
  USER_PROFILE: 0,          // never cache
  ORDER_STATUS: 0,          // never cache
  INVENTORY_COUNT: 0,       // never cache
} as const;
```

### Cache-Aside Implementation

```typescript
async function getProductList(filters: ProductFilters): Promise<Product[]> {
  const key = `products:list:${hashFilters(filters)}`;

  // 1. Check cache
  const cached = await cache.get<Product[]>(key);
  if (cached) return cached;

  // 2. Query database
  const products = await productRepository.find({
    where: buildWhereClause(filters),
    take: 20,
    order: { createdAt: 'desc' },
  });

  // 3. Store in cache
  await cache.set(key, products, CACHE_TTL.PRODUCT_LIST);

  return products;
}
```

---

> **Next:** See [detect.md](./detect.md) if you haven't run detection first. Then proceed to the project files in `./project/` for runnable implementations.
