# How to Fix Backend Rendering & Response Performance

> A comprehensive fix guide for backend rendering and response delivery. Every fix here is production-ready with real TypeScript code.

---

## 1. fast-json-stringify

`JSON.stringify` is slow because it must inspect every value, handle type coercion, and escape special characters. `fast-json-stringify` generates a specialized serializer from a JSON schema, achieving 5-10x speedup.

### Basic Usage

```typescript
import fastJson from 'fast-json-stringify';

const stringify = fastJson({
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    price: { type: 'number' },
    category: { type: 'string' },
    inStock: { type: 'boolean' },
  },
});

// Usage in route handler
app.get('/products/:id', async (req, res) => {
  const product = await db.getProduct(req.params.id);
  res.setHeader('Content-Type', 'application/json');
  res.send(stringify(product));
});
```

### Array Schemas

```typescript
const stringifyList = fastJson({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      price: { type: 'number' },
    },
  },
});

app.get('/products', async (req, res) => {
  const products = await db.getProducts();
  res.send(stringifyList(products));
});
```

### Gotchas with Optional Fields

```typescript
// If the schema says "name" is required but the object is null/undefined,
// fast-json-stringify will throw. Handle with defaults:

const stringify = fastJson({
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string', default: '' },
    description: { type: 'string', default: '' },
  },
});

// Or use "nullable" for fields that can be null:
const stringifyNullable = fastJson({
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    deletedAt: { type: ['string', 'null'] },
  },
});
```

### Benchmark

```typescript
const data = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  name: `Product ${i}`,
  price: Math.random() * 100,
  category: 'electronics',
  inStock: true,
}));

const start1 = performance.now();
for (let i = 0; i < 1000; i++) JSON.stringify(data);
console.log(`JSON.stringify: ${(performance.now() - start1).toFixed(2)}ms`);

const start2 = performance.now();
for (let i = 0; i < 1000; i++) stringify(data);
console.log(`fast-json-stringify: ${(performance.now() - start2).toFixed(2)}ms`);
```

---

## 2. Response Streaming

Buffering loads the entire response into memory before sending. Streaming sends data progressively, keeping memory flat regardless of response size.

### Express Streaming

```typescript
import { Cursor } from 'pg';

app.get('/export', async (req, res) => {
  const client = await pool.connect();
  const cursor = client.query(new Cursor('SELECT * FROM products ORDER BY id'));

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');

  const readBatch = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      cursor.read(1000, (err, rows) => {
        if (err) return reject(err);
        if (rows.length === 0) {
          cursor.close(() => client.release());
          res.end();
          return resolve();
        }

        for (const row of rows) {
          res.write(JSON.stringify(row) + '\n');
        }

        readBatch().then(resolve).catch(reject);
      });
    });
  };

  await readBatch();
});
```

### NestJS Streaming

```typescript
import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller('export')
export class ExportController {
  @Get()
  async export(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/x-ndjson');

    const cursor = this.db.query(new Cursor('SELECT * FROM products'));

    const readBatch = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        cursor.read(1000, (err, rows) => {
          if (err) return reject(err);
          if (rows.length === 0) {
            res.end();
            return resolve();
          }

          for (const row of rows) {
            res.write(JSON.stringify(row) + '\n');
          }

          readBatch().then(resolve).catch(reject);
        });
      });
    };

    await readBatch();
  }
}
```

### Client-Side Handling

```typescript
const response = await fetch('/api/export');
const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n').filter(Boolean);

  for (const line of lines) {
    const item = JSON.parse(line);
    processItem(item);
  }
}
```

---

## 3. HTTP Response Compression

Compression reduces payload size by 60-80%. The tradeoff is CPU time for compression vs network time for transfer.

### Brotli vs gzip

| Aspect | gzip | Brotli |
|--------|------|--------|
| Compression ratio | ~70% | ~80% |
| CPU usage | Low | Medium-High |
| Best for | Dynamic content | Static assets |
| Build time | Fast | Slow |

Use gzip for dynamic API responses. Use Brotli for pre-compressed static assets.

### On-the-Fly Compression

```typescript
import compression from 'compression';

app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));
```

### Pre-Compression at Build Time

```typescript
import { createGzip, createBrotliCompress } from 'zlib';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

async function preCompress(filePath: string): Promise<void> {
  await Promise.all([
    pipeline(
      createReadStream(filePath),
      createGzip({ level: 6 }),
      createWriteStream(`${filePath}.gz`)
    ),
    pipeline(
      createReadStream(filePath),
      createBrotliCompress(),
      createWriteStream(`${filePath}.br`)
    ),
  ]);
}
```

### When NOT to Compress

- Responses < 1KB (overhead exceeds savings)
- Already compressed content (images, video, zip files)
- When `Content-Encoding` is already set

---

## 4. Sparse Fieldsets / Field Projection

Allowing clients to request only specific fields reduces payload size and serialization time.

### Express Implementation

```typescript
app.get('/products', async (req, res) => {
  const fields = req.query.fields
    ? (req.query.fields as string).split(',')
    : null;

  let products = await db.getProducts();

  if (fields) {
    products = products.map((product) => {
      const projected: Record<string, unknown> = {};
      for (const field of fields) {
        if (field in product) {
          projected[field] = product[field];
        }
      }
      return projected;
    });
  }

  res.json(products);
});
```

### Database-Level Projection

```typescript
app.get('/products', async (req, res) => {
  const fields = req.query.fields as string | undefined;
  const select = fields ? fields.split(',') : undefined;

  const products = await prisma.product.findMany({
    select: select
      ? Object.fromEntries(select.map((f) => [f, true]))
      : undefined,
  });

  res.json(products);
});
```

### Usage

```
GET /products?fields=id,name,price
```

Returns only the requested fields, reducing payload by 60-80% for large objects.

---

## 5. Database Cursor Streaming

Loading entire result sets into memory is dangerous at scale. Cursor streaming processes rows one at a time.

### pg Cursor

```typescript
import { Pool, Cursor } from 'pg';

const pool = new Pool();

app.get('/export', async (req, res) => {
  const client = await pool.connect();

  try {
    const cursor = client.query(
      new Cursor('SELECT * FROM products WHERE active = true ORDER BY id')
    );

    res.setHeader('Content-Type', 'application/x-ndjson');

    const readBatch = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        cursor.read(500, (err, rows) => {
          if (err) return reject(err);
          if (rows.length === 0) {
            cursor.close(() => client.release());
            res.end();
            return resolve();
          }

          for (const row of rows) {
            if (!res.write(JSON.stringify(row) + '\n')) {
              // Backpressure: wait for drain event
              res.once('drain', () => readBatch().then(resolve).catch(reject));
              return;
            }
          }

          readBatch().then(resolve).catch(reject);
        });
      });
    };

    await readBatch();
  } catch (err) {
    client.release();
    throw err;
  }
});
```

### Backpressure Handling

When the client cannot keep up, `res.write()` returns false. Pause reading from the cursor until the client catches up:

```typescript
const canContinue = res.write(data);
if (!canContinue) {
  await new Promise((resolve) => res.once('drain', resolve));
}
```

---

## 6. Pagination Performance

### Offset-Based (Slow at Scale)

```sql
SELECT * FROM products ORDER BY id LIMIT 20 OFFSET 100000;
```

The database must scan and discard 100,000 rows before returning 20. Performance degrades linearly with page number.

### Cursor-Based (Fast at Scale)

```sql
SELECT * FROM products WHERE id > 100000 ORDER BY id LIMIT 20;
```

The database uses an index to jump directly to the starting point. Performance is constant regardless of page number.

### Implementation

```typescript
import { createHash } from 'crypto';

// Encode cursor: Base64(JSON({id, timestamp}))
function encodeCursor(id: number, timestamp: string): string {
  return Buffer.from(JSON.stringify({ id, timestamp })).toString('base64url');
}

// Decode cursor
function decodeCursor(cursor: string): { id: number; timestamp: string } {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString());
}

app.get('/products', async (req, res) => {
  const { cursor, limit = '20' } = req.query;
  const take = Math.min(parseInt(limit as string), 100);

  let products;
  if (cursor) {
    const { id, timestamp } = decodeCursor(cursor as string);
    products = await prisma.product.findMany({
      where: {
        OR: [
          { createdAt: { gt: timestamp } },
          { createdAt: timestamp, id: { gt: id } },
        ],
      },
      take: take + 1, // Fetch one extra to check if there are more
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  } else {
    products = await prisma.product.findMany({
      take: take + 1,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  const hasMore = products.length > take;
  const data = hasMore ? products.slice(0, take) : products;
  const nextCursor = hasMore
    ? encodeCursor(data[data.length - 1].id, data[data.length - 1].createdAt)
    : null;

  res.json({ data, nextCursor });
});
```

---

## 7. Template Caching

### Pre-Compiling Templates

```typescript
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';

// Compile once at startup
const templates = new Map<string, HandlebarsTemplateDelegate>();

function loadTemplate(name: string): HandlebarsTemplateDelegate {
  if (templates.has(name)) return templates.get(name)!;

  const source = readFileSync(`./templates/${name}.hbs`, 'utf-8');
  const compiled = Handlebars.compile(source);
  templates.set(name, compiled);
  return compiled;
}

app.get('/page/:id', (req, res) => {
  const template = loadTemplate('page');
  const data = { title: 'Product Page', id: req.params.id };
  res.send(template(data));
});
```

### LRU Cache for Template Output

```typescript
import { LRUCache } from 'lru-cache';

const outputCache = new LRUCache<string, string>({
  max: 500,
  ttl: 1000 * 60 * 5, // 5 minutes
});

app.get('/product/:id', (req, res) => {
  const cacheKey = `product:${req.params.id}`;
  const cached = outputCache.get(cacheKey);

  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.send(cached);
  }

  const template = loadTemplate('product');
  const data = { /* ... */ };
  const html = template(data);

  outputCache.set(cacheKey, html);
  res.setHeader('X-Cache', 'MISS');
  res.send(html);
});
```

---

## 8. ETag and Conditional Requests

ETags allow clients to cache responses and avoid re-downloading unchanged data.

### Implementation

```typescript
import { createHash } from 'crypto';

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body: unknown) => {
    const serialized = JSON.stringify(body);
    const etag = `"${createHash('md5').update(serialized).digest('hex')}"`;

    res.setHeader('ETag', etag);

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return res;
    }

    return originalJson(body);
  };

  next();
});
```

### Usage

```
GET /api/products
→ 200 OK, ETag: "abc123", body: [...]

GET /api/products
→ If-None-Match: "abc123"
→ 304 Not Modified (no body)
```

The client saves bandwidth, the server saves serialization time.

---

## 9. Batch Endpoints

Individual HTTP requests per item are slow due to connection overhead, serialization overhead, and database roundtrips.

### Why Batch is Faster

| Approach | 100 Items | Time |
|----------|-----------|------|
| 100 individual requests | 100 HTTP roundtrips | ~2000ms |
| 1 batch request | 1 HTTP roundtrip | ~100ms |

### Implementation

```typescript
interface BatchRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
}

interface BatchResponse {
  status: number;
  body: unknown;
}

app.post('/api/batch', async (req, res) => {
  const requests: BatchRequest[] = req.body;
  const results: BatchResponse[] = [];

  for (const batchReq of requests) {
    try {
      // Route to appropriate handler based on method and path
      const result = await handleRequest(batchReq);
      results.push({ status: 200, body: result });
    } catch (err) {
      results.push({
        status: err instanceof NotFoundException ? 404 : 500,
        body: { error: err instanceof Error ? err.message : 'Internal error' },
      });
    }
  }

  res.json(results);
});
```

### Client Usage

```typescript
const response = await fetch('/api/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify([
    { method: 'GET', path: '/api/v1/products/1' },
    { method: 'GET', path: '/api/v1/products/2' },
    { method: 'POST', path: '/api/v1/products', body: { name: 'New' } },
  ]),
});

const results = await response.json();
// results[0] = { status: 200, body: { id: 1, ... } }
// results[1] = { status: 200, body: { id: 2, ... } }
// results[2] = { status: 201, body: { id: 3, ... } }
```

---

## 10. Serialization Schema Validation

In development, validate response shapes to catch over-serialization bugs early.

### Zod Schema Validation

```typescript
import { z } from 'zod';

const ProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.number(),
  category: z.string(),
});

const ProductListSchema = z.object({
  data: z.array(ProductSchema),
  total: z.number(),
  page: z.number(),
});

// Development-only middleware
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (body: unknown) => {
      const result = ProductListSchema.safeParse(body);

      if (!result.success) {
        console.error(`Schema validation failed for ${req.url}:`, result.error.issues);
      }

      return originalJson(body);
    };

    next();
  });
}
```

### Why This Matters

Over-serialization sends data the client does not need. Schema validation catches:
- Extra fields that should not be exposed
- Missing fields the client expects
- Incorrect types that break the API contract
- Circular references that cause runtime errors

---

> **Next:** See [detect.md](./detect.md) if you haven't run detection first. Then proceed to the project files in `./project/` for runnable implementations.
