# How to Fix Backend Performance Issues (Fundamentals)

> The second half of the detect guide -- now we act on what we found. Every fix here is production-ready with real TypeScript code.

---

## 1. Triage Protocol

Not all performance issues are equal. Fix the ones that matter most first. Use this matrix:

| User Impact | Frequency | Effort | Priority |
|-------------|-----------|--------|----------|
| High | High | Low | Fix immediately |
| High | Low | Low | Fix now |
| High | High | High | Plan for sprint |
| Low | High | Low | Fix when convenient |
| Low | Low | Low | Ignore or backlog |
| Low | High | High | Evaluate ROI |

**User Impact** = Does the user notice this? A slow checkout button matters. A slow background job does not.

**Frequency** = How many users hit this per day? Affecting 10,000 users/day is 10x more important than 10 users/day.

**Effort** = How many hours to fix? Adding an index is 1 hour. Rewriting a module is 40 hours.

Start with the top-left cell: high impact, high frequency, low effort. These are your quick wins.

---

## 2. Event Loop Protection

The event loop is single-threaded. One blocking operation freezes all concurrent requests.

### Move CPU Work to Worker Threads

```typescript
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

// Worker file: heavy-computation.ts
if (!isMainThread) {
  const { data } = workerData;
  const result = data.sort((a: number, b: number) => a - b);
  parentPort?.postMessage(result);
}

// Main thread
function sortInWorker(data: number[]): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./heavy-computation.js', {
      workerData: { data },
    });
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}

// Usage in request handler
app.get('/sort', async (req, res) => {
  const data = Array.from({ length: 1_000_000 }, () => Math.random());
  const sorted = await sortInWorker(data);
  res.json({ count: sorted.length });
});
```

### Use setImmediate for Yielding

```typescript
function processItems(items: string[], index: number): Promise<void> {
  return new Promise((resolve) => {
    if (index >= items.length) {
      resolve();
      return;
    }

    // Process one item
    doSomething(items[index]);

    // Yield to event loop, then process next
    setImmediate(() => {
      processItems(items, index + 1).then(resolve);
    });
  });
}
```

### Async/Await Pitfalls

```typescript
// BAD: Sequential awaits block event loop for total duration
async function fetchAll(urls: string[]): Promise<Response[]> {
  const results: Response[] = [];
  for (const url of urls) {
    results.push(await fetch(url)); // Each await blocks until done
  }
  return results;
}

// GOOD: Parallel execution
async function fetchAll(urls: string[]): Promise<Response[]> {
  return Promise.all(urls.map((url) => fetch(url)));
}

// GOOD: Bounded parallelism (max 10 concurrent)
async function fetchAll(urls: string[]): Promise<Response[]> {
  const CONCURRENCY = 10;
  const results: Response[] = [];

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map((url) => fetch(url)));
    results.push(...batchResults);
  }

  return results;
}
```

---

## 3. Connection Pooling

Every database connection costs: TCP handshake + TLS handshake + authentication + memory on the DB server. Without pooling, each request pays this cost.

### pg Pool Configuration

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  // Minimum connections maintained in the pool
  // Set to 2-4 for most apps. Higher = more memory, but faster response.
  min: 2,

  // Maximum connections the pool will create
  // Set to 10-20 for most apps. Higher = more concurrent requests, but DB has limits.
  // Rule of thumb: max = (CPU cores * 2) + disk spindles
  max: 20,

  // How long (ms) a connection can sit idle before being closed
  // Set to 30000 (30s) for most apps. Lower = less memory, higher = less reconnection.
  idleTimeoutMillis: 30_000,

  // How long (ms) to wait for a connection from the pool before throwing
  // Set to 5000 (5s). If you need to wait longer, your pool is too small.
  connectionTimeoutMillis: 5_000,

  // Maximum time (ms) a client can live in the pool before being destroyed
  // Prevents stale connections. Set to 1800000 (30 min).
  maxUses: 7500,
  allowExitOnIdle: true,
});

// Test the pool on startup
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }
  console.log('Database connected successfully');
});

// Always use pool.query, never create a client directly
app.get('/products', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products LIMIT $1', [20]);
  res.json(rows);
});
```

### What Happens Without Pooling

Without a pool, each request opens a new connection, runs the query, then closes it. At 100 RPS with 50ms connection time, you spend 5 seconds per second just connecting. With a pool, connections are reused -- the 5 seconds becomes near-zero.

---

## 4. Response Compression

Compression reduces payload size by 60-80%. The tradeoff is CPU time for compression vs network time for transfer.

### Express Compression Middleware

```typescript
import compression from 'compression';

app.use(compression({
  // Only compress responses > 1KB
  // Small responses are already fast, compression overhead isn't worth it
  threshold: 1024,

  // Compression level (1-9). 6 is default, 4 is faster with slightly less compression.
  level: 6,

  // Don't compress these content types
  filter: (req, res) => {
    // Don't compress if client doesn't support it
    if (!req.headers['accept-encoding']) return false;

    // Don't compress images (already compressed)
    const type = res.getHeader('content-type') as string;
    if (type?.includes('image/')) return false;

    // Don't compress if response is already compressed
    if (res.getHeader('content-encoding')) return false;

    return compression.filter(req, res);
  },
}));
```

### Brotli vs gzip

| Aspect | gzip | Brotli |
|--------|------|--------|
| Compression ratio | ~70% | ~80% |
| CPU usage | Low | Medium-High |
| Browser support | All | All modern |
| Best for | Dynamic content | Static assets |

Use gzip for dynamic API responses. Use Brotli for pre-compressed static assets at build time.

### When NOT to Compress

- Images (JPEG, PNG, WebP) -- already compressed
- Video and audio files -- already compressed
- Responses < 1KB -- overhead exceeds savings
- Already compressed data (zip files, gzipped data)

---

## 5. JSON Serialization

`JSON.stringify` is surprisingly slow at scale. For 1000 objects, it can take 5-10ms. `fast-json-stringify` is 5-10x faster.

### fast-json-stringify

```typescript
import fastJson from 'fast-json-stringify';

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  description: string;
}

const stringifyProduct = fastJson<Product>({
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    category: { type: 'string' },
    price: { type: 'number' },
    description: { type: 'string' },
  },
});

// Usage in route handler
app.get('/products', async (req, res) => {
  const products = await getProducts();
  res.setHeader('Content-Type', 'application/json');
  res.send(stringifyProduct(products));
});
```

### Benchmark Comparison

```typescript
import fastJson from 'fast-json-stringify';

const data = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  name: `Product ${i}`,
  category: 'electronics',
  price: Math.random() * 100,
  description: 'A great product',
}));

const stringify = fastJson({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      category: { type: 'string' },
      price: { type: 'number' },
      description: { type: 'string' },
    },
  },
});

// Benchmark
const iterations = 1000;
const start1 = performance.now();
for (let i = 0; i < iterations; i++) JSON.stringify(data);
const nativeTime = performance.now() - start1;

const start2 = performance.now();
for (let i = 0; i < iterations; i++) stringify(data);
const fastTime = performance.now() - start2;

console.log(`JSON.stringify: ${nativeTime.toFixed(2)}ms`);
console.log(`fast-json-stringify: ${fastTime.toFixed(2)}ms`);
console.log(`Speedup: ${(nativeTime / fastTime).toFixed(1)}x`);
```

---

## 6. HTTP Keep-Alive

Without keep-alive, every HTTP request opens a new TCP connection. With keep-alive, connections are reused.

### Enable Keep-Alive on Node.js Server

```typescript
import http from 'http';

const server = http.createServer(app);

// Keep-alive timeout (ms)
// Default is 5000ms. AWS ALB has a 60s idle timeout.
// Set to 65000ms to stay above ALB timeout.
server.keepAliveTimeout = 65_000;

// Headers timeout must be > keepAliveTimeout
server.headersTimeout = 66_000;

server.listen(3000);
```

### Enable Keep-Alive on HTTP Clients

```typescript
import http from 'http';
import https from 'https';

// Node.js built-in fetch (Node 18+) uses keep-alive by default

// For axios, create a custom agent
import axios from 'axios';

const agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 100,
  maxFreeSockets: 10,
});

const client = axios.create({
  httpAgent: agent,
  httpsAgent: new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
  }),
});

// Usage
const response = await client.get('http://api.example.com/data');
```

---

## 7. Stream Everything

Buffering loads entire payloads into memory. Streaming processes data as it arrives.

### File Serving with Streams

```typescript
import { createReadStream } from 'fs';

// BAD: Loads entire file into memory
app.get('/file', async (req, res) => {
  const data = await readFile('/path/to/large-file.csv');
  res.send(data);
});

// GOOD: Streams file directly to response
app.get('/file', (req, res) => {
  const stream = createReadStream('/path/to/large-file.csv');
  stream.pipe(res);
});
```

### Database Cursor Streaming

```typescript
import { Pool } from 'pg';

const pool = new Pool();

app.get('/export', async (req, res) => {
  const client = await pool.connect();

  try {
    const cursor = client.query(
      new Cursor('SELECT * FROM products ORDER BY id')
    );

    res.setHeader('Content-Type', 'application/x-ndjson');

    const readBatch = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        cursor.read(100, (err, rows) => {
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
  } catch (err) {
    client.release();
    throw err;
  }
});
```

### Response Piping

```typescript
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';

app.get('/large-data', async (req, res) => {
  const dataStream = getDataStream(); // Readable stream
  const gzipStream = createGzip();

  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Type', 'application/json');

  await pipeline(dataStream, gzipStream, res);
});
```

---

## 8. Error Handling Performance

`try/catch` in hot paths has measurable overhead. The V8 engine deoptimizes functions with try/catch blocks.

### Avoid try/catch in Hot Loops

```typescript
// BAD: try/catch in tight loop deoptimizes the function
function parseAll(items: string[]): object[] {
  const results: object[] = [];
  for (const item of items) {
    try {
      results.push(JSON.parse(item));
    } catch {
      // Error handling
    }
  }
  return results;
}

// GOOD: Validate before parsing
function parseAll(items: string[]): object[] {
  const results: object[] = [];
  for (const item of items) {
    if (!item || item[0] !== '{') continue;
    results.push(JSON.parse(item));
  }
  return results;
}
```

### Pre-allocate Error Objects

```typescript
// BAD: Creating new Error objects captures stack trace (expensive)
function throwError(): never {
  throw new Error('Something went wrong');
}

// GOOD: Reuse error instances for known errors
const VALIDATION_ERROR = new Error('Validation failed');
const NOT_FOUND_ERROR = new Error('Resource not found');

function validate(input: unknown): void {
  if (!input) throw VALIDATION_ERROR;
}
```

### Avoid Stack Traces in Production

```typescript
// CaptureStackTrace is expensive
function createError(message: string): Error {
  const error = new Error(message);
  // Only capture stack in development
  if (process.env.NODE_ENV === 'development') {
    Error.captureStackTrace(error, createError);
  }
  return error;
}
```

---

## 9. Logging Performance

`console.log` is synchronous and blocks the event loop. At high throughput, logging becomes the bottleneck.

### Why console.log is Slow

```typescript
// console.log does: format string + write to stdout + flush
// stdout is blocking by default in Node.js
// Each console.log takes ~0.1-0.5ms
// At 10,000 RPS, that's 1-5 seconds of blocking per second
```

### Pino: The Fast Logger

```typescript
import pino from 'pino';

const logger = pino({
  // JSON format (fast, structured)
  level: process.env.LOG_LEVEL ?? 'info',

  // Pretty print in development only
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,

  // Redact sensitive fields
  redact: ['password', 'token', 'authorization'],

  // Custom serializers
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

// Usage -- 10-20x faster than console.log
app.get('/products', (req, res) => {
  logger.info({ productId: 123 }, 'Fetching products');
  // ...
  logger.info({ count: 50, duration: 12.3 }, 'Products fetched');
});
```

### Async Logging

```typescript
import pino from 'pino';

// Write logs to a file asynchronously (non-blocking)
const logger = pino({
  level: 'info',
}, pino.transport({
  targets: [
    {
      target: 'pino/file',
      options: { destination: '/var/log/app.log', mkdir: true },
    },
    {
      target: 'pino/stdout',
    },
  ],
}));
```

### Log Levels in Production

```typescript
const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
});

// In production, only warn and error are logged
// debug and info are skipped entirely (zero cost)
logger.debug('This is cheap in production'); // Skipped
logger.info('This is cheap in production');  // Skipped
logger.warn('This is logged');               // Written
logger.error('This is logged');              // Written
```

---

## 10. Before/After Benchmark Table

Document every optimization with measurements. This creates accountability and helps you decide if a fix was worth the complexity.

```markdown
| Endpoint | p50 Before | p99 Before | p50 After | p99 After | RPS Before | RPS After | Technique |
|----------|-----------|-----------|----------|----------|-----------|----------|-----------|
| GET /products | 45ms | 320ms | 12ms | 85ms | 2,100 | 8,500 | Connection pooling + index |
| GET /products/:id | 15ms | 95ms | 8ms | 35ms | 5,200 | 12,000 | HTTP keep-alive |
| POST /orders | 120ms | 800ms | 45ms | 200ms | 800 | 2,400 | async writes + compression |
| GET /export | 4,500ms | 12,000ms | 200ms | 450ms | 10 | 200 | Cursor streaming |
| GET /search | 85ms | 500ms | 30ms | 120ms | 1,500 | 4,200 | JSON.stringify -> fast-json |
```

**Rules for honest measurement:**

- Run each measurement 3 times, take the median
- Use the same hardware for before and after
- Test under realistic load (not 1 user)
- Log the tool version and configuration
- Document what changed -- not just the numbers

A 4x RPS improvement sounds impressive, but if your p99 went from 320ms to 85ms, the real story is user experience. Always report both latency and throughput.

---

> **Next:** See [detect.md](./detect.md) if you haven't run detection first. Then proceed to the project files in `./project/` for runnable implementations.
