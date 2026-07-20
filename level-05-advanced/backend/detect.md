# How to Detect CPU Bottlenecks & Advanced Backend Issues

> Senior engineer's guide to diagnosing CPU-level, concurrency, and throughput bottlenecks in Node.js backends.

---

## 1. Node.js Concurrency Model vs Traditional Servers

### Single-Threaded Event Loop

Node.js runs on a single thread with an event loop. I/O operations (DB queries, HTTP requests, file reads) are offloaded to the libuv thread pool. But CPU-bound work (JSON parsing, image processing, crypto hashing) blocks the event loop.

**Traditional multi-threaded server** (Apache, Java): each request gets its own thread. CPU-bound work blocks only that thread.

**Node.js**: a single CPU-bound operation blocks ALL other requests. One slow endpoint can halt your entire server.

### Detecting This Behavior

Fire a slow CPU task and observe all other requests queuing:

```bash
# Terminal 1: start server
node server.js

# Terminal 2: fire slow CPU request
curl -X POST http://localhost:3000/cpu-intensive &

# Terminal 3: fire normal requests — observe latency spike
for i in {1..20}; do
  curl -w "\n%{time_total}s\n" -s http://localhost:3000/health
done
```

If normal requests show 500ms+ latency while the CPU task runs, the event loop is blocked.

---

## 2. Detecting Event Loop Blocking

### Event Loop Lag Ticker

The simplest detection method — measure how far behind the event loop is:

```typescript
// Add to your NestJS main.ts for production monitoring
const start = process.hrtime.bigint();
setInterval(() => {
  const lag = Number(process.hrtime.bigint() - start) / 1e6 - 1000;
  if (lag > 100) {
    console.warn(`Event loop lag: ${lag.toFixed(0)}ms`);
  }
  if (lag > 500) {
    console.error(`CRITICAL event loop lag: ${lag.toFixed(0)}ms`);
  }
}, 1000);
```

- **< 10ms**: healthy
- **10-100ms**: mild blocking
- **> 100ms**: significant blocking — investigate
- **> 500ms**: severe — request timeouts likely

### clinic.js Doctor

```bash
npm install -g clinic
clinic doctor -- node server.js
# Open the generated HTML report
```

The "Event Loop delay" chart shows spikes. Each spike above 100ms reveals a blocking operation. Correlate spike timestamps with request logs to find the culprit.

### Node.js Built-in Tracing

```bash
node --trace-event-categories=v8,node,net server.js
# Produces a JSON trace file
# Open in chrome://tracing for native flame graph
```

---

## 3. CPU Profiling Deep Dive

### node --cpu-prof

```bash
# Generate a CPU profile
node --cpu-prof server.js
# After 30 seconds, kill the process
# Produces: CPU.20240115.120000.12345.cpuprofile
```

Open in Chrome DevTools:
1. Open `chrome://tracing`
2. Click "Load" → select the .cpuprofile file
3. Switch to "Flame" view

### Reading the Flame Graph

- **Wide functions**: slow — they take significant wall time
- **Flat plateaus**: blocking — they block everything below them
- **Self-time > 5%**: significant hot function — optimize first
- **Deep stacks**: recursive or deeply nested calls — consider iterative

### clinic.js Flame

```bash
clinic flame -- node server.js
```

Superior to raw --cpu-prof: shows both JavaScript and native stack frames, highlights hot paths, and includes a summary panel.

---

## 4. Worker Thread Opportunity Detection

### Identifying Candidates

A function is a Worker Thread candidate if it:
1. Takes > 50ms in CPU profiling
2. Does NOT touch I/O (no DB, no HTTP, no file system)
3. Could run concurrently with other requests

### Profiling Approach

```typescript
// Wrap every service method to measure execution time
function profileMethod(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  descriptor.value = async function (...args: any[]) {
    const start = performance.now();
    const result = await original.apply(this, args);
    const duration = performance.now() - start;
    // Log with method name for later analysis
    console.log(`[PROFILE] ${target.constructor.name}.${propertyKey}: ${duration.toFixed(2)}ms`);
    return result;
  };
}
```

Run for 1000 requests, then rank by `average_duration × call_frequency = total_cost`. The top candidates are your Worker Thread opportunities.

---

## 5. Detecting Cluster Underutilization

### htop — Single Core at 100%

```bash
htop
# Look at per-core CPU bars
# If core 0 is at 100% and cores 1-7 are at 0%, you have a cluster problem
```

### pm2 Per-Process CPU

```bash
pm2 monit
# Shows CPU usage per process
# If only 1 process is active, cluster mode isn't working
```

### Why Node.js Uses Only 1 Core

By default, `node server.js` runs a single process on one core. To use all cores:

```bash
# Use cluster module or pm2
pm2 start server.js -i max  # uses all available cores
```

### Confirm with Process Count

```bash
# Should show N processes (one per core)
ps aux | grep node | grep -v grep | wc -l
```

---

## 6. Memory Leak Detection in Long-Running Services

### Trending memoryUsage()

```typescript
setInterval(() => {
  const mem = process.memoryUsage();
  console.log(JSON.stringify({
    rss: (mem.rss / 1024 / 1024).toFixed(1),
    heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(1),
    heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(1),
    external: (mem.external / 1024 / 1024).toFixed(1),
  }));
}, 30000);
```

If `heapUsed` grows monotonically over hours/days without leveling off, you have a leak.

### Heap Snapshot Diff in Chrome DevTools

```bash
# Start Node with inspect flag
node --inspect=0.0.0.0:9229 server.js

# Connect Chrome DevTools: chrome://inspect
# Take heap snapshot #1
# Run load test (artillery, autocannon)
# Take heap snapshot #2
# Compare: objects retained between snapshots that should have been GC'd
```

Filter by "Detached" to find DOM/Array/Map nodes that were never released.

---

## 7. Queue Backpressure Detection

### Bull Queue Metrics

```typescript
import { Queue } from 'bull';

const queue = new Queue('email');

// Check queue health
const [waiting, active, completed, failed, delayed] = await Promise.all([
  queue.getWaitingCount(),
  queue.getActiveCount(),
  queue.getCompletedCount(),
  queue.getFailedCount(),
  queue.getDelayedCount(),
]);

console.log({ waiting, active, completed, failed, delayed });

// PROBLEM THRESHOLDS:
// failed > 1% of completed = alarming
// waiting > 1000 = processing bottleneck
// active = maxConcurrency limit hit
```

### @bull-board/api Dashboard

```bash
npm install @bull-board/api @bull-board/express bull
```

Mount the dashboard at `/admin/queues` for real-time queue visualization.

---

## 8. gRPC vs REST Performance Differences

### Side-by-Side Measurement

```bash
# REST (autocannon)
autocannon -c 100 -d 30 http://localhost:3000/api/users/1

# gRPC (grpcurl)
grpcurl -plaintext -d '{"id":"1"}' localhost:50051 users.UserService/GetUser
```

### Why gRPC Wins for Internal Communication

- **Binary protocol**: protobuf is ~10x smaller than JSON
- **HTTP/2 multiplexing**: multiple requests over one connection
- **No serialization overhead**: pre-compiled schemas
- **Streaming**: bidirectional streams for real-time data

Typical result: gRPC is 2-5x faster for internal service calls.

---

## 9. Stream Back-pressure Detection

### Monitoring writableNeedDrain

```typescript
const readable = getSource();
const writable = getDest();

readable.on('data', (chunk) => {
  if (!writable.write(chunk)) {
    // writable is full — back-pressure detected
    console.warn('Back-pressure: writable buffer full');
    readable.pause();
    writable.once('drain', () => readable.resume());
  }
});
```

### Watch readable.readableLength

```typescript
setInterval(() => {
  if (readable.readableLength > 1000) {
    console.warn(`Stream buffer growing: ${readable.readableLength} chunks queued`);
  }
}, 1000);
```

### Memory Growing During Streaming

If `process.memoryUsage().heapUsed` grows monotonically during a streaming operation, the writable is not keeping up.

---

## 10. Connection and File Descriptor Limits

### Check Current Usage

```bash
# File descriptors for a specific process
ls /proc/PID/fd | wc -l
lsof -p PID | wc -l

# System-wide limit
ulimit -n

# Current usage vs limit
cat /proc/PID/limits | grep "open files"
```

### Detecting EMFILE Errors

```bash
# Search logs for file descriptor exhaustion
grep "EMFILE" /var/log/app/*.log

# Error message: "spawn EMFILE" or "open EMFILE"
# Means too many open files — increase ulimit or fix connection leaks
```

**Threshold**: if fd usage > 80% of ulimit, you're approaching the limit.

---

## 11. Thundering Herd Detection

### What It Is

All queued requests fire simultaneously when a lock releases or cache expires. For example: 1000 requests wait for a Redis cache key. The key expires. All 1000 hit the database simultaneously.

### How to Detect

```bash
# Run autocannon and watch for p99 spikes
autocannon -c 100 -d 60 http://localhost:3000/api/data
```

**Signatures**:
- p50 stays normal (5-10ms)
- p99 spikes to 500ms+ (all queued requests fire at once)
- Database CPU spikes periodically
- "Cache stampede" pattern in logs

### Reproduce

```bash
# Kill Redis, let requests queue, then restart Redis
redis-cli shutdown
sleep 5
redis-server &
# Observe p99 spike in autocannon output
```

---

## 12. Diagnostic Checklist

| # | Issue | Tool | Command | Normal | Problem | Action |
|---|-------|------|---------|--------|---------|--------|
| 1 | Event loop lag | clinic.js | `clinic doctor -- node server.js` | < 10ms | > 100ms | Find blocking function |
| 2 | CPU blocking | --cpu-prof | `node --cpu-prof server.js` | < 5% self-time | > 10% self-time | Move to Worker Thread |
| 3 | Single core usage | htop | `htop` | All cores active | 1 core 100% | Enable cluster mode |
| 4 | Memory leak | heap snapshot | `node --inspect` + Chrome | Stable heap | Growing heap | Find retained objects |
| 5 | Queue backlog | Bull metrics | `queue.getWaitingCount()` | < 100 | > 1000 | Increase workers |
| 6 | Failed jobs | Bull metrics | `queue.getFailedCount()` | < 1% | > 1% | Fix job processor |
| 7 | Stream back-pressure | readableLength | Monitor buffer size | 0 | > 100 chunks | Add back-pressure handling |
| 8 | FD exhaustion | lsof | `lsof -p PID \| wc -l` | < 80% limit | > 80% limit | Fix connection leaks |
| 9 | Thundering herd | autocannon | Watch p99/p50 ratio | p99 < 5x p50 | p99 > 10x p50 | Add request coalescing |
| 10 | gRPC timeout | grpcurl | `grpcurl -timeout 5s` | < 100ms | > 1s | Check downstream service |
| 11 | DNS resolution | dig | `dig example.com` | < 50ms | > 500ms | Use DNS caching |
| 12 | TLS handshake | openssl | `openssl s_client -connect host:443` | < 100ms | > 500ms | Use session resumption |
| 13 | GC pauses | node --trace-gc | `node --trace-gc server.js` | < 10ms | > 50ms | Increase heap size |
| 14 | Heap limit | v8 stats | `v8.getHeapStatistics()` | < 70% | > 90% | Increase --max-old-space |
| 15 | Cluster imbalance | pm2 monit | `pm2 monit` | Equal CPU | 1 process hot | Check sticky sessions |
| 16 | N+1 queries | pg_stat | `SELECT * FROM pg_stat_activity` | < 5ms | > 50ms | Add DataLoader |
| 17 | Connection pool | pool stats | Monitor active/idle ratio | < 80% | > 90% | Increase pool size |
| 18 | Response size | Content-Length | Check header | < 100KB | > 1MB | Paginate, compress |
| 19 | Request timeout | NestJS logs | Check timeout errors | < 1% | > 5% | Increase timeout or optimize |
| 20 | 5xx error rate | monitoring | Grafana/Datadog dashboard | < 0.1% | > 1% | Check logs for root cause |
| 21 | CPU utilization | os.loadavg | `os.loadavg()` | < cores | > cores × 2 | Scale horizontally |
| 22 | Thread pool exhaustion | libuv | Monitor thread pool queue | 0 waiting | > 10 waiting | Increase UV_THREADPOOL_SIZE |
| 23 | OpenSSL lock contention | clinic.js | Check native modules | < 1% | > 5% | Use Node.js built-in crypto |
| 24 | JSON.parse blocking | --cpu-prof | Profile serialization | < 5ms | > 50ms | Use streaming JSON parser |
| 25 | Regex DoS | logs | Check ReDoS patterns | < 1ms | > 100ms | Rewrite regex |
| 26 | Prototype pollution | security audit | `npm audit` | 0 vulnerabilities | Any | Patch dependencies |
| 27 | Dependency size | bundlephobia | Check npm package size | < 50KB | > 500KB | Find lighter alternative |
| 28 | Startup time | `time node server.js` | Measure cold start | < 2s | > 10s | Lazy-load, reduce deps |

---

> **Next:** After detection, see [fix.md](./fix.md) for solutions, then the project files in `./project/` for runnable implementations.
