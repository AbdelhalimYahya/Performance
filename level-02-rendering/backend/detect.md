# How to Detect Backend Rendering & Response Performance Issues

> A comprehensive guide for identifying performance problems in how Node.js backends render and deliver responses.

---

## 1. What is Backend Rendering?

Backend rendering is not one thing. It is four distinct approaches, each with different performance characteristics.

**JSON API Serialization:** The most common pattern. The server serializes a JavaScript object to JSON and sends it as the response. Performance depends on object size, depth, and `JSON.stringify` speed. This is what most REST APIs do.

**Server-Side HTML Rendering (Template Engines):** The server renders HTML using a template engine (Handlebars, EJS, Pug). The template is compiled once, then executed per-request with data. Performance depends on template complexity, data size, and caching.

**Response Streaming:** The server sends data progressively as it becomes available, instead of buffering the entire response. Used for large datasets, real-time feeds, and Server-Sent Events. Performance depends on backpressure handling and chunk size.

**GraphQL Execution:** The server resolves a query graph, executing resolver functions for each field. Performance depends on resolver efficiency, N+1 problems, and DataLoader batching.

Each approach has different bottlenecks. A JSON API is CPU-bound (serialization). A template engine is I/O-bound (file reads) then CPU-bound (compilation). Streaming is I/O-bound (network). GraphQL is CPU-bound (resolver execution) and I/O-bound (database queries).

---

## 2. JSON Serialization Bottlenecks

`JSON.stringify` is surprisingly slow at scale. For a 1000-item array with 10 fields each, it can take 5-15ms. At 1000 RPS, that is 5-15 seconds of CPU time per second.

### How to Detect

Add timing middleware to measure serialization time:

```typescript
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body: unknown) => {
    const start = performance.now();
    const serialized = JSON.stringify(body);
    const duration = performance.now() - start;

    res.setHeader('X-Serialize-Time', `${duration.toFixed(2)}ms`);
    res.setHeader('X-Payload-Size', `${Buffer.byteLength(serialized)} bytes`);

    if (duration > 5) {
      console.warn(`Slow serialization: ${req.method} ${req.url} took ${duration.toFixed(2)}ms`);
    }

    return originalJson(body);
  };

  next();
});
```

### Large Object Graphs

Objects with deep nesting and many keys are expensive to serialize. A product with nested variants, images, reviews, and categories can have 50+ keys. Each key requires a string quote, colon, and comma in the output.

Detect by logging payload size:

```typescript
res.on('finish', () => {
  const size = parseInt(res.getHeader('content-length') as string ?? '0');
  if (size > 1_000_000) {
    console.warn(`Large payload: ${req.url} sent ${(size / 1024).toFixed(0)}KB`);
  }
});
```

### Circular Reference Guards

`JSON.stringify` throws on circular references. Libraries like `fast-safe-stringify` handle this but add overhead. If you see unexpected serialization errors in production, check for circular references in your data models.

### Profiling with Node.js --cpu-prof

```bash
node --cpu-prof server.js
# Generate load for 30 seconds
# Open the .cpuprofile in Chrome DevTools
# Look for JSON.stringify in the flame graph
```

If `JSON.stringify` appears as a wide block in the flame graph, serialization is your bottleneck. Use `fast-json-stringify` with a schema to get 5-10x speedup.

---

## 3. Template Engine Performance

Template engines have two phases: compilation (parsing the template into a function) and execution (calling the function with data). Compilation is expensive; execution is cheap.

### Detecting Slow Compilation

```typescript
const start = performance.now();
const compiled = handlebars.compile(templateString);
const compileTime = performance.now() - start;
console.log(`Template compiled in ${compileTime.toFixed(2)}ms`);
```

If compilation is slow, the template is too complex or has too many partials. Pre-compile templates at startup.

### Detecting Uncached Templates

If you read templates from disk on every request, you pay file I/O on every render:

```typescript
// BAD: Reads file on every request
app.get('/page', (req, res) => {
  const template = fs.readFileSync('template.hbs', 'utf-8');
  const compiled = handlebars.compile(template);
  res.send(compiled({ title: 'Hello' }));
});

// GOOD: Compile once at startup
const template = handlebars.compile(fs.readFileSync('template.hbs', 'utf-8'));
app.get('/page', (req, res) => {
  res.send(template({ title: 'Hello' }));
});
```

### Heavy Helpers

Custom Handlebars helpers that do complex work (database queries, API calls, heavy computation) slow down every template that uses them. Profile by wrapping helpers with timing:

```typescript
handlebars.registerHelper('heavyHelper', (data) => {
  const start = performance.now();
  const result = expensiveOperation(data);
  const duration = performance.now() - start;
  if (duration > 1) {
    console.warn(`Heavy helper took ${duration.toFixed(2)}ms`);
  }
  return result;
});
```

---

## 4. Response Size Analysis

Over-fetching from the server sends more data than the client needs. This wastes bandwidth and increases latency.

### Logging Response Content-Length

```typescript
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body: unknown) => {
    const serialized = JSON.stringify(body);
    const size = Buffer.byteLength(serialized);

    res.setHeader('X-Payload-Size', `${size} bytes`);

    if (size > 1_000_000) {
      console.warn(`Large response: ${req.method} ${req.url} — ${(size / 1024).toFixed(0)}KB`);
    }

    return res.send(serialized);
  };

  next();
});
```

### Detecting Large Payloads

Set up alerts for responses exceeding thresholds:

| Size | Status | Action |
|------|--------|--------|
| < 100KB | Normal | No action |
| 100KB-1MB | Warning | Investigate if necessary |
| 1MB-10MB | Alert | Likely over-fetching |
| > 10MB | Critical | Must fix before production |

### Gzip Ratio Analysis

```typescript
const zlib = require('zlib');

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body: unknown) => {
    const raw = Buffer.from(JSON.stringify(body));
    const gzipped = zlib.gzipSync(raw);

    res.setHeader('X-Raw-Size', `${raw.length}`);
    res.setHeader('X-Compressed-Size', `${gzipped.length}`);
    res.setHeader('X-Compression-Ratio', `${((1 - gzipped.length / raw.length) * 100).toFixed(1)}%`);

    return res.send(gzipped);
  };

  next();
});
```

A low compression ratio (< 20%) means the data is already compact (numbers, short strings). A high ratio (> 80%) means there is significant text redundancy.

---

## 5. Streaming vs Buffering Detection

Buffering loads the entire response into memory before sending. Streaming sends data progressively.

### Detecting Buffered Responses

```typescript
// This buffers everything in memory
app.get('/export', async (req, res) => {
  const data = await db.query('SELECT * FROM products'); // 100K rows
  res.json(data); // Entire result in memory at once
});
```

Monitor memory during the request:

```typescript
app.get('/export', async (req, res) => {
  const memBefore = process.memoryUsage().heapUsed;

  const data = await db.query('SELECT * FROM products');
  res.json(data);

  res.on('finish', () => {
    const memAfter = process.memoryUsage().heapUsed;
    const delta = (memAfter - memBefore) / 1048576;
    if (delta > 50) {
      console.warn(`Export used ${delta.toFixed(1)}MB of heap memory`);
    }
  });
});
```

### Streaming Alternative

```typescript
app.get('/export', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');

  const cursor = db.query(new Cursor('SELECT * FROM products'));
  let rows;

  do {
    rows = await cursor.read(1000);
    for (const row of rows) {
      res.write(JSON.stringify(row) + '\n');
    }
  } while (rows.length > 0);

  res.end();
});
```

Memory usage stays flat regardless of result set size.

---

## 6. Database Result Set Size

### Detecting N+1 Queries

Enable ORM query logging:

```typescript
// Prisma
const prisma = new PrismaClient({
  log: [{ level: 'query', emit: 'event' }],
});

let queryCount = 0;
prisma.$on('query', () => {
  queryCount++;
});

// In middleware, reset per request
app.use((req, res, next) => {
  queryCount = 0;
  res.on('finish', () => {
    if (queryCount > 10) {
      console.warn(`${req.method} ${req.url} executed ${queryCount} queries`);
    }
  });
  next();
});
```

If a request executes 50+ queries, you likely have N+1. The fix is to use `include` (Prisma) or `JOIN` (raw SQL) to fetch related data in a single query.

### Detecting SELECT * Over-fetching

```sql
-- BAD: Fetches all columns
SELECT * FROM products;

-- GOOD: Fetches only needed columns
SELECT id, name, price FROM products;
```

Check query plans:

```sql
EXPLAIN ANALYZE SELECT * FROM products WHERE category = 'electronics';
```

If the output shows "Seq Scan" on a large table, add an index on the filter column.

---

## 7. Middleware Chain Cost

Each middleware in the chain adds latency. Some middleware is expensive (body parsing, authentication, logging).

### Measuring Each Middleware

```typescript
function timedMiddleware(name: string, fn: Function) {
  return (req, res, next) => {
    const start = performance.now();
    const originalNext = next;

    const wrappedNext = () => {
      const duration = performance.now() - start;
      res.setHeader(`Server-Timing-${name}`, `${duration.toFixed(2)}ms`);
      originalNext();
    };

    fn(req, res, wrappedNext);
  };
}

app.use(timedMiddleware('cors', cors()));
app.use(timedMiddleware('body-parser', express.json()));
app.use(timedMiddleware('helmet', helmet()));
app.use(timedMiddleware('auth', authMiddleware));
```

### Server-Timing Headers

```typescript
app.use((req, res, next) => {
  const timings: string[] = [];
  const start = performance.now();

  const originalEnd = res.end;
  res.end = function (...args) {
    const total = performance.now() - start;
    timings.push(`total;dur=${total.toFixed(2)}`);
    res.setHeader('Server-Timing', timings.join(', '));
    return originalEnd.apply(this, args);
  };

  // Helper to add timing phases
  (req as any).addTiming = (name: string) => {
    const duration = performance.now() - start;
    timings.push(`${name};dur=${duration.toFixed(2)}`);
  };

  next();
});
```

---

## 8. GraphQL Resolver Profiling

### Detecting N+1 in Resolvers

GraphQL N+1 happens when a list query triggers individual database calls for each item's relationships.

```graphql
query {
  products {        # 1 query: SELECT * FROM products
    id
    name
    category {      # N queries: SELECT * FROM categories WHERE id = ?
      name
    }
    reviews {       # N queries: SELECT * FROM reviews WHERE product_id = ?
      rating
    }
  }
}
```

If 10 products with categories and reviews triggers 21 queries, you have N+1.

### DataLoader Hit Rate

```typescript
import DataLoader from 'dataloader';

const categoryLoader = new DataLoader(async (ids: number[]) => {
  const categories = await db.query(
    'SELECT * FROM categories WHERE id IN (?)',
    [ids]
  );
  return ids.map((id) => categories.find((c) => c.id === id));
});

// In resolver
const resolvers = {
  Product: {
    category: (product) => categoryLoader.load(product.categoryId),
  },
};
```

Monitor hit rate:

```typescript
const stats = { hits: 0, misses: 0 };
const originalLoad = categoryLoader.load.bind(categoryLoader);

categoryLoader.load = (id: number) => {
  if (categoryLoader.cache.has(id)) {
    stats.hits++;
  } else {
    stats.misses++;
  }
  return originalLoad(id);
};
```

### Resolver Execution Time

```typescript
const resolvers = {
  Query: {
    products: async () => {
      const start = performance.now();
      const result = await db.query('SELECT * FROM products');
      console.log(`products resolver: ${(performance.now() - start).toFixed(2)}ms`);
      return result;
    },
  },
};
```

---

## 9. Serialization vs Business Logic

Separate and measure pure serialization time from actual computation time:

```typescript
app.get('/products', async (req, res) => {
  // Business logic phase
  const dbStart = performance.now();
  const products = await db.query('SELECT * FROM products');
  const dbDuration = performance.now() - dbStart;

  // Serialization phase
  const serializeStart = performance.now();
  const serialized = JSON.stringify(products);
  const serializeDuration = performance.now() - serializeStart;

  res.setHeader('Server-Timing',
    `db;dur=${dbDuration.toFixed(2)},serialize;dur=${serializeDuration.toFixed(2)}`
  );

  res.send(serialized);
});
```

If serialization takes more than 30% of total request time, use `fast-json-stringify` or switch to a binary format (MessagePack, Protocol Buffers).

---

## 10. Diagnostic Checklist

| # | Issue | How to Detect | Tool | Expected Value |
|---|-------|---------------|------|----------------|
| 1 | Slow JSON.stringify | X-Serialize-Time header | Middleware | < 5ms |
| 2 | Large payload | Content-Length header | Logging | < 100KB |
| 3 | Over-fetching from DB | SELECT * in queries | EXPLAIN ANALYZE | Select needed columns |
| 4 | N+1 queries | Query count per request | ORM logging | < 5 queries |
| 5 | Template compilation | Time template.compile() | Performance.now() | < 10ms at startup |
| 6 | Uncached templates | File reads per request | fs monitoring | 0 reads after startup |
| 7 | Buffered large response | Memory spike during response | process.memoryUsage() | < 50MB delta |
| 8 | Middleware chain cost | Server-Timing headers | HTTP headers | Each < 5ms |
| 9 | GraphQL N+1 | Query count per request | DataLoader metrics | 1 query per level |
| 10 | Slow resolvers | Resolver timing logs | Performance.now() | Each < 50ms |
| 11 | No compression | Content-Encoding header | curl -I | br or gzip |
| 12 | Missing cache headers | Cache-Control header | curl -I | Set for static assets |
| 13 | Circular reference errors | Serialization exceptions | Error logs | 0 |
| 14 | Response time regression | X-Response-Time trending | Monitoring | Stable or improving |
| 15 | Memory leak on export | RSS growth during stream | process.memoryUsage() | < 10MB delta |
| 16 | Slow helper functions | Helper timing logs | Performance.now() | Each < 1ms |
| 17 | Large object depth | Object depth analysis | JSON.stringify replacer | < 10 levels |
| 18 | Connection pool wait | Pool timing metrics | pg/mysql events | < 10ms |
| 19 | Cursor leak | Open cursor count | DB monitoring | 0 idle cursors |
| 20 | Serialization schema mismatch | Unexpected fields in response | Schema validation | 0 extra fields |

---

> **Next:** After detecting issues with this guide, move to [fix.md](./fix.md) to learn how to resolve them.
