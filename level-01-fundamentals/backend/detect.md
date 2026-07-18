# How to Detect Backend Performance Issues

> A senior engineer's reference for identifying, measuring, and diagnosing backend performance problems in Node.js, Express, and NestJS applications.

---

## 1. The Backend Performance Problem Space

Backend performance is not one metric. It is three distinct dimensions, each requiring different tools and strategies.

**Latency** is the time between a request arriving and a response being sent. It is what the user perceives as "speed." Low latency means fast responses. Latency is measured per-request -- p50, p95, p99 tell you the story across your traffic.

**Throughput** is the number of requests your server can handle per second (RPS). High throughput means your server handles load well. Throughput and latency are inversely related -- as load increases, latency increases. The point where latency spikes and throughput plateaus is your capacity limit.

**Resource Utilization** is how much CPU, memory, disk, and network your server consumes. High utilization is not inherently bad -- it means you are using what you paid for. But when utilization hits 100%, performance collapses.

The mistake most engineers make is optimizing latency when the real problem is throughput, or optimizing throughput when the real bottleneck is a single slow database query. Profile first, measure second, fix third.

---

## 2. Node.js Event Loop Profiling

The event loop is Node.js's concurrency model. It is a single thread that processes callbacks. When a callback takes too long, every other callback waits. This is the number one cause of backend performance issues.

### What Event Loop Blocking Looks Like

```
Event Loop Tick Timeline:
|---- 50ms ----|---- 50ms ----|---- 50ms ----|
  [fast] [fast] [SLOW 400ms]  [fast] [fast]
                              ↑ Everything waits here
                              ↑ Request queue grows
                              ↑ p99 latency spikes
```

### Detecting Blocked Event Loop

**Clinic.js Doctor** is the best tool for this:

```bash
npx clinic doctor -- node server.js
```

It generates an HTML report showing event loop delay over time, CPU usage, memory usage, and recommendations for specific issues.

**Event Loop Lag Measurement** -- add this to your server:

```typescript
let lastCheck = process.hrtime.bigint();
let lag = 0;

setInterval(() => {
  const now = process.hrtime.bigint();
  const expected = BigInt(100);
  const actual = (now - lastCheck) / BigInt(1_000_000);
  lag = Number(actual - expected);
  lastCheck = now;

  if (lag > 50) {
    console.warn(`Event loop lag: ${lag}ms`);
  }
}, 100);
```

**V8 Tick Profiler** with `--prof` flag:

```bash
node --prof server.js
# After generating load, press Ctrl+C
node --prof-process isolate-*.log > processed.txt
```

The processed output shows time spent in each function. Look for functions consuming > 5% of total CPU time -- those are your optimization targets.

---

## 3. CPU Profiling

CPU profiling answers: "Where is my server spending time?"

### node --cpu-prof

```bash
node --cpu-prof server.js
# Generate load for 30 seconds
# Press Ctrl+C
# Creates CPU.*.cpuprofile files
```

Open the `.cpuprofile` file in Chrome DevTools Performance tab. You get a flame graph showing exactly which functions consume CPU.

### Clinic.js Flame

```bash
npx clinic flame -- node server.js
```

Generates an interactive flame graph. The wider a block, the more CPU time that function uses.

### Reading a Flame Graph

```
                    +-----------------------------+
                    |         root (100%)          |
                    +---------------+--------------+
                    |  HTTP Layer   |   DB Layer   |
                    +---------+-----+   (20%)      |
                    | JSON    |MW  |              |
                    |(40%)    |(5%)|              |
                    +---------+-----+--------------+

Bottom = caller, Top = callee.
Wide blocks = hot paths (optimize these).
Narrow deep stacks = recursion (potential issue).
```

### Hot Paths

A "hot path" is a function that appears in many call stacks and consumes significant CPU. In a flame graph, hot paths are wide blocks at the bottom of deep stacks. Common hot paths in Node.js:

- `JSON.stringify` -- serialization
- `crypto.*` -- hashing operations
- `Buffer.concat` -- string concatenation
- ORM query builders -- SQL generation

### Sampling vs Instrumentation

**Sampling** (node --prof, clinic flame): Records stack traces at regular intervals. Low overhead (~1-3%), suitable for production. Less accurate for short-lived functions.

**Instrumentation** (0x, nodautocannon): Wraps every function call with timing. Higher overhead (~10-20%), not for production. More accurate for exact timings.

Use sampling in production. Use instrumentation in development for precise optimization.

---

## 4. Memory Profiling

Memory issues manifest as: growing RSS over time (leak), frequent GC pauses (pressure), or OOM crashes.

### Heap Snapshots via Chrome DevTools

Connect Chrome DevTools to your running Node.js process:

```bash
node --inspect server.js
# Open chrome://inspect in Chrome
# Click "inspect" next to your Node process
# Go to Memory tab, take Heap Snapshot
```

Take two snapshots 5 minutes apart. Use the "Comparison" view to see objects allocated between snapshots but never freed. These are your leaks.

### --heap-prof Flag

```bash
node --heap-prof server.js
# Generate load for 5 minutes
# Press Ctrl+C
# Creates heap-*.heapprofile files
```

Open in Chrome DevTools Memory tab. Shows allocation sites with retained size.

### Detecting Memory Leaks

```bash
node -e "require('v8').writeHeapSnapshot()"
# ... run some load ...
node -e "require('v8').writeHeapSnapshot()"
```

Compare snapshots in Chrome DevTools. If the same object types keep growing between snapshots, you have a leak.

### V8 GC Pressure Indicators

GC pressure shows up as frequent Major GC events, long pauses (> 50ms), and RSS climbing steadily without leveling off. Monitor with:

```typescript
setInterval(() => {
  const mem = process.memoryUsage();
  const heapPct = (mem.heapUsed / mem.heapTotal) * 100;
  if (heapPct > 80) {
    console.warn(`Heap usage high: ${heapPct.toFixed(1)}%`);
  }
}, 10_000);
```

---

## 5. HTTP Benchmarking Tools

Benchmarking answers: "How many requests can my server handle, and how fast?"

### autocannon (Node.js)

```bash
npx autocannon -c 100 -d 30 http://localhost:3000/api/products
```

Output interpretation:

```
Stat         1%      50%      99%      Avg       Stddev
Latency (ms) 2.5     12.3     45.8     14.2      8.7
Req/Sec      8500    12000    11500    11800     450
Bytes/Sec    8.5MB   12MB     11.5MB   11.8MB    450KB
```

- **p50 (50th percentile):** Median latency. Half your requests are faster.
- **p99 (99th percentile):** 1% of requests are slower. This is your "bad day" metric.
- **p999 (99.9th percentile):** Your worst 0.1%. Often reveals edge cases.
- **RPS (Requests/Second):** Throughput. Higher is better.

### wrk

```bash
wrk -t4 -c100 -d30s http://localhost:3000/api/products
```

### k6

```javascript
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
  },
};

export default function () {
  http.get('http://localhost:3000/api/products');
}
```

### Interpreting Results

- **Latency increases linearly with load:** Normal, server processing sequentially.
- **Latency spikes suddenly at a threshold:** Bottleneck hit (connection pool, event loop).
- **Throughput plateaus while latency rises:** Server at capacity. Add instances.
- **p99 >> p50:** Tail latency issue -- slow query, cold cache, or GC pause.

---

## 6. Database Query Analysis

The database is the bottleneck in 80% of backend performance issues.

### PostgreSQL EXPLAIN ANALYZE

```sql
EXPLAIN ANALYZE
SELECT * FROM products WHERE category = 'electronics' ORDER BY price DESC LIMIT 20;
```

Key things to look for:

- `Seq Scan` = full table scan (add an index)
- `Sort Method: external merge` = sorting spilled to disk (increase work_mem)
- `actual time` vs `cost`: if actual >> cost, statistics are stale (run ANALYZE)

### MySQL Slow Query Log

```ini
# my.cnf
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 0.1
```

```bash
pt-query-digest /var/log/mysql/slow.log
```

### Detecting N+1 from ORM Logs

Enable query logging in Prisma:

```typescript
const prisma = new PrismaClient({
  log: [{ level: 'query', emit: 'event' }],
});

prisma.$on('query', (e) => {
  console.log(`Query: ${e.query} (${e.duration}ms)`);
});
```

If you see 100+ similar queries in a single request, you have an N+1.

---

## 7. Express/NestJS Request Profiling

### Middleware Timing in Express

```typescript
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const originalEnd = res.end;

  res.end = function (...args) {
    const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
    res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);

    if (duration > 500) {
      console.warn(`Slow: ${req.method} ${req.url} ${duration.toFixed(0)}ms`);
    }

    return originalEnd.apply(this, args);
  };

  next();
});
```

### NestJS Request Lifecycle

```typescript
@Injectable()
export class ProfilingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap(() => {
        const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
        req.res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
      })
    );
  }
}
```

### Measuring Each Middleware

```typescript
function timedMiddleware(name: string, fn: Function) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    fn(req, res, () => {
      const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
      console.log(`[${name}] ${duration.toFixed(2)}ms`);
      next();
    });
  };
}
```

---

## 8. System Resource Monitoring

### CPU Usage

```bash
top -p $(pgrep -d',' node)
ps aux | grep node | grep -v grep
vmstat 1 10
```

What the numbers mean:

- **%CPU > 80% sustained:** CPU-bound. Add instances or optimize hot paths.
- **%CPU < 20% but slow:** I/O-bound. Check database, network, or disk.
- **Load average > CPU cores:** Processes waiting for CPU. Scale up.

### Memory Usage

```bash
ps -o pid,rss,vsz,comm -p $(pgrep node)
free -h
```

- **RSS:** Physical memory used. This is what matters.
- **If RSS >> heapTotal:** Large external allocations (buffers, compiled code).

### File Descriptors

```bash
ls /proc/$(pgrep node)/fd | wc -l
cat /proc/$(pgrep node)/limits | grep "open files"
```

Default limit is 1024. Set to 65535 in production. Each HTTP connection uses 1+ FD.

### TCP Connections

```bash
ss -s
ss -tnp | grep :3000 | awk '{print $1}' | sort | uniq -c
ss -tn state time-wait | wc -l
```

---

## 9. Distributed Tracing Concepts

When a request flows through multiple services, you need distributed tracing to understand where time is spent.

### Trace ID Propagation

Every request gets a unique trace ID passed through HTTP headers, message queues, and database queries.

```
Request -> Service A (trace-abc-123)
       -> Service B (trace-abc-123)
       -> Database (trace-abc-123)
```

### Spans

A span represents a single unit of work within a trace:

```
Trace: abc-123 (total: 450ms)
+-- Span: HTTP GET /api/products (450ms)
|   +-- Span: auth middleware (12ms)
|   +-- Span: validate query (3ms)
|   +-- Span: DB query (380ms)    <-- bottleneck
|   |   +-- Span: pool acquire (2ms)
|   |   +-- Span: SQL execute (375ms)
|   |   +-- Span: pool release (3ms)
|   +-- Span: serialize response (15ms)
```

### OpenTelemetry

```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

---

## 10. Quick Diagnostic Checklist

| # | Issue | How to Detect | Tool | Expected Value |
|---|-------|---------------|------|----------------|
| 1 | High p99 latency | Load test | autocannon | p99 < 200ms |
| 2 | Event loop lag | Monitor interval | clinic doctor | < 10ms |
| 3 | CPU saturation | System monitor | top/htop | < 80% sustained |
| 4 | Memory leak | Monitor RSS over time | clinic doctor | Stable after 10min |
| 5 | GC pressure | Monitor pause times | --inspect DevTools | Pauses < 50ms |
| 6 | N+1 queries | ORM query logging | Prisma/TypeORM logs | 1-5 queries per request |
| 7 | Slow DB queries | Query analysis | EXPLAIN ANALYZE | Execution < 50ms |
| 8 | Connection pool exhaustion | Monitor pool stats | pg pool events | Waiters = 0 |
| 9 | Too many file descriptors | Count open FDs | ls /proc/PID/fd | < 80% of limit |
| 10 | TCP connection leak | Count TIME_WAIT | ss -tn state time-wait | < 1000 |
| 11 | Slow middleware | Request timing | X-Response-Time header | Each < 50ms |
| 12 | Large response payload | Response size logging | Content-Length header | < 1MB |
| 13 | No HTTP compression | Check headers | curl -I | Content-Encoding set |
| 14 | Missing cache headers | Check headers | curl -I | Cache-Control set |
| 15 | JSON serialization slow | CPU profiling | clinic flame | < 5ms per serialize |
| 16 | DNS resolution slow | Network timing | dig +trace | < 50ms |
| 17 | TLS handshake overhead | Connection timing | ss -tni | < 100ms |
| 18 | Request queue growing | Monitor pending | Custom metric | 0 pending |
| 19 | Thread pool exhaustion | Worker thread stats | piscina metrics | Idle > 50% |
| 20 | Unhandled rejections | Error monitoring | process.on handler | 0 |
| 21 | Crash rate | Error tracking | Sentry/APM | < 0.1% |
| 22 | Restart frequency | Process manager | PM2 logs | 0 unexpected |
| 23 | Cold start time | Measure startup | instrumentation hook | < 2s |
| 24 | Keep-alive utilization | Connection reuse | ss -tn state established | > 80% reused |
| 25 | Idle connection count | Monitor connections | ss -tn | < 10 idle |

---

> **Next:** After detecting issues with this guide, move to [fix.md](./fix.md) to learn how to resolve them.
