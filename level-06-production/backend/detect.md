# How to Detect Production Backend Performance Issues

> A comprehensive guide to identifying, diagnosing, and responding to performance problems in live Node.js/NestJS backends.

---

## 1. The Production Observation Challenge

You cannot reproduce production issues locally. The data is different, the concurrency is different, the hardware is different, and the network topology is different. A query that takes 5ms locally with 100 rows takes 2000ms in production with 10 million rows. A function that handles 10 concurrent requests in testing melts under 10,000 concurrent users.

The three pillars of observability give you different angles on the same problem:

| Pillar | Question | Example |
|--------|----------|---------|
| **Metrics** | *What* is happening? | "p99 latency is 4500ms" |
| **Traces** | *Where* is it happening? | "The /checkout span shows 3200ms in the payment-service" |
| **Logs** | *Why* is it happening? | "Error: Connection timeout after 3000ms to payment-gateway.example.com" |

You need all three. Metrics tell you there is a problem. Traces tell you where the problem is. Logs tell you why the problem exists.

---

## 2. Reading Application Metrics

Prometheus + Grafana is the standard stack. Here is what to look for:

### Latency Trends

A **p99 latency trending upward** over hours or days means a slow query is getting slower — usually because a table is growing, an index is missing, or a cache is cold. Do not ignore gradual increases. A query that goes from 200ms to 400ms over a week will hit your p99 budget before you notice.

```typescript
// Expose custom latency histogram
const histogram = new Histogram({
  name: 'http_request_duration_ms',
  help: 'Request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
});
```

### Error Rate Spikes

An **error rate spike** without a corresponding traffic increase means a dependency failed. Check Redis, PostgreSQL, external APIs, and message queues. A 5xx spike at 2:00 AM when traffic is flat means something broke, not that you are getting more users.

### CPU Anomalies

A **CPU spike without traffic increase** means a background job went wrong. Check cron jobs, queue processors, and batch operations. A poorly written aggregation query can pin a CPU core for minutes.

### Memory Patterns

**Memory climbing without leveling off** is a memory leak. Normal Node.js memory usage shows a sawtooth pattern — it grows, then drops after garbage collection. If the baseline keeps rising, objects are accumulating faster than the GC can collect them.

---

## 3. Distributed Trace Analysis

A trace waterfall in Jaeger or Zipkin shows every service involved in handling a request. Reading it correctly is a skill.

### The Critical Path

The **critical path** is the longest chain of sequential spans. If service A calls service B (200ms) then service C (300ms), the critical path is 500ms. Parallel calls do not extend the critical path — the response time is the maximum of parallel branches, not the sum.

### Gaps Between Spans

A **gap between spans** means serialization overhead, connection wait, or network latency. If service A's span ends at 100ms and service B's span starts at 150ms, that 50ms gap is serialization/deserialization of the request body. Reduce payload size or switch to Protocol Buffers.

### Finding the Slowest Service

Sort spans by **self-time** (time spent in that span excluding child calls). The service with the highest self-time is where the bottleneck is. A span with 2000ms duration and 1800ms self-time means the work is happening in that service, not in a downstream call.

---

## 4. Log-based Performance Detection

Structured logs are queryable logs. Every log entry should include request ID, duration, user ID, and status code.

### Querying Slow Requests

Find all requests taking over 1 second in the last hour:

```sql
-- KQL (Azure Data Explorer / Log Analytics)
traces
| where timestamp > ago(1h)
| where customDimensions.duration > 1000
| project timestamp, customDimensions.route, customDimensions.duration, customDimensions.userId
| order by customDimensions.duration desc
```

### Correlating Errors with Deployments

When error logs spike, the first question is: "Did we deploy something?" Compare the error spike timestamp with your CI/CD deployment logs. If the spike aligns with a deployment, roll back first and investigate second.

### Log Sampling

At high throughput, logging every request is expensive. Use **probabilistic sampling** — log 100% of errors, 10% of successful requests. You retain full visibility on failures while reducing log volume by 90%.

```typescript
// Simple sampling middleware
if (Math.random() < 0.1 || response.statusCode >= 400) {
  logger.info({ requestId, duration, statusCode }, 'Request completed');
}
```

---

## 5. Memory Leak Detection in Production

### Trending memoryUsage()

Call `process.memoryUsage()` every 30 seconds and expose it as a Prometheus gauge:

```typescript
setInterval(() => {
  const mem = process.memoryUsage();
  heapUsedGauge.set(mem.heapUsed);
  rssGauge.set(mem.rss);
  externalGauge.set(mem.external);
}, 30_000);
```

If `heapUsed` grows 10MB per hour and never drops after GC, you have a leak.

### Triggering Heap Snapshots Without Restart

Node.js supports `--heapsnapshot-signal=SIGUSR2`. Send the signal and a `.heapsnapshot` file is written to disk:

```bash
kill -USR2 <pid>
```

Open the snapshot in Chrome DevTools Memory panel. Look for **Detached DOM elements**, **growing arrays**, and **objects retained by event listeners** that were never removed.

### Common Leak Sources

- Event listeners added in loops without removal
- Global arrays/maps that grow with each request
- Timers (`setInterval`) created but never cleared
- Closures capturing large objects

---

## 6. Event Loop Lag in Production

The event loop is single-threaded. If it is blocked, every request waits.

### Measuring Event Loop Lag

```typescript
let lastCheck = process.hrtime.bigint();

setInterval(() => {
  const now = process.hrtime.bigint();
  const lag = Number(now - lastCheck) / 1e6 - 100; // expected 100ms interval
  eventLoopLagGauge.set(lag);
  lastCheck = now;
}, 100);
```

A value above 100ms means the event loop is blocked. At 200ms, users feel delay. At 500ms, requests are timing out.

### Correlating Lag Spikes

When event loop lag spikes, check which request types were active. A synchronous `JSON.parse()` on a 10MB payload blocks the event loop for hundreds of milliseconds. Move heavy parsing to worker threads.

---

## 7. Database Performance Regression Detection

### Slow Query Alerts

Set an alert if any query p99 exceeds 500ms. Use pg_stat_statements for PostgreSQL or the slow query log for MySQL.

```sql
-- PostgreSQL: queries slower than 500ms in the last hour
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 500
ORDER BY mean_exec_time DESC;
```

### Connection Pool Saturation

If `pg pool.waitingCount > 0` for more than 10 seconds, you need more connections or a faster query. A waiting count means requests are queued waiting for a connection — this adds latency directly.

---

## 8. Queue Backlog Growth Detection

### Monotonic Growth

If Bull Queue `waitingCount` grows monotonically over 30 minutes, your processors are slower than your producers. This is not a temporary burst — it is a sustained backlog.

### Temporary vs Sustained

A temporary burst spikes waitingCount then drops. A sustained backlog has waitingCount increasing every minute. Set an alert: "if waitingCount > 100 for 10 consecutive minutes, page on-call."

---

## 9. Third-party Dependency Failures

External APIs fail silently. A payment provider returning 500ms responses instead of 200ms will degrade your p99 without triggering error alerts.

### Tracking Outbound Latency

Instrument every outbound HTTP call:

```typescript
const timer = outboundDuration.startTimer({ service: 'payment-gateway' });
try {
  const response = await axios.post(url, data, { timeout: 5000 });
  timer({ status: 'success' });
} catch (error) {
  timer({ status: 'error' });
  throw error;
}
```

### Circuit Breaker Thresholds

If error rate exceeds 50% over a 30-second window, trip the circuit breaker. Return a fallback response immediately instead of waiting for a timeout.

---

## 10. Production Health Check Design

A health check endpoint should verify every critical dependency — with timeouts on each check so the health check itself cannot be slow.

```typescript
async function healthCheck() {
  const checks = await Promise.allSettled([
    timeout(prisma.$queryRaw`SELECT 1`, 3000),      // DB
    timeout(redis.ping(), 2000),                      // Redis
    timeout(axios.get('https://api.stripe.com/health', { timeout: 3000 }), 3000), // External
  ]);

  return {
    status: checks.every(c => c.status === 'fulfilled') ? 'healthy' : 'degraded',
    checks: {
      database: checks[0].status,
      redis: checks[1].status,
      stripe: checks[2].status,
    },
  };
}
```

Never let a health check take longer than 5 seconds total. If a dependency is down, the health check should report degraded, not hang.

---

## 11. Diagnostic Checklist

| # | Symptom | Likely Cause | Metric to Check | Query to Run | Action |
|---|---------|--------------|-----------------|--------------|--------|
| 1 | p99 latency trending up | Slow query / missing index | `http_request_duration_ms` p99 | `pg_stat_statements ORDER BY mean_exec_time DESC` | Add missing index or optimize query |
| 2 | Error rate spike | Dependency failure | `http_requests_total{status=~"5.."}` | Check downstream service health endpoints | Restart or rollback dependency |
| 3 | CPU spike without traffic | Background job gone wrong | `process_cpu_seconds_total` | `ps aux` or container CPU metrics | Kill or throttle the rogue process |
| 4 | Memory growing without drop | Memory leak | `process_heap_used_bytes` | Take heap snapshot with USR2 signal | Analyze with Chrome DevTools |
| 5 | Event loop lag > 100ms | Synchronous blocking | `event_loop_lag_ms` | Check for sync JSON.parse, fs operations | Move to worker threads |
| 6 | DB connection pool full | Slow queries holding connections | `pg_pool_waiting_count` | `pg_stat_activity WHERE state = 'active'` | Kill long-running queries, increase pool |
| 7 | Queue backlog growing | Processors too slow | `bull_queue_waiting_count` | Check processor error rates and durations | Add workers or optimize processors |
| 8 | External API p99 > SLA | Third-party degradation | Outbound HTTP duration histogram | Check vendor status page | Enable circuit breaker, serve fallback |
| 9 | 502 Bad Gateway | Process crash / OOM | Container restart count | `kubectl describe pod` or PM2 logs | Increase memory limit, fix crash |
| 10 | Slow response on one route | Route-specific issue | Per-route latency labels | Filter Grafana by route label | Profile that specific handler |
| 11 | Redis latency spike | Large keys / slow commands | `redis_commands_duration_seconds` | `redis-cli --latency` and `SLOWLOG GET` | Optimize slow commands, evict large keys |
| 12 | SSL handshake failures | Certificate expiry or mismatch | TLS handshake duration | `openssl s_client -connect host:port` | Renew certificate, check chain |
| 13 | DNS resolution slow | DNS server issues | DNS lookup duration in traces | Check trace waterfalls for DNS spans | Use DNS caching or switch resolver |
| 14 | High garbage collection time | Too many allocations | `nodejs_gc_duration_seconds` | Profile with `--inspect` and Chrome | Reduce object creation in hot paths |
| 15 | WebSocket disconnections | Memory or timeout | WebSocket connection count | Check connection state in traces | Implement heartbeat, check memory |
| 16 | Request body parsing slow | Large payloads | `http_request_body_parse_duration` | Log payload sizes per route | Set body size limits, stream large uploads |
| 17 | File descriptor exhaustion | Connection leak | `process_open_fds` | `ls /proc/<pid>/fd | wc -l` | Close unused connections, check pool |
| 18 | Thread pool exhaustion | Blocking operations | `worker_threads_active_count` | Monitor thread pool metrics | Move blocking ops to dedicated threads |
| 19 | Cache hit rate dropping | Cold cache or eviction | `cache_hit_rate` ratio | Check Redis `INFO keyspace` | Warm cache, review eviction policy |
| 20 | JWT validation slow | Secret key rotation issue | Auth middleware duration | Filter traces by auth span | Cache JWKS, reduce validation calls |
| 21 | Rate limiter triggering | Traffic spike or abuse | `rate_limit_rejected_total` | Check IP patterns in access logs | Add WAF rules, adjust limits |
| 22 | Serialization errors | Schema mismatch | `serialization_error_total` | Check API contract versions | Deploy matching client/server versions |
| 23 | Connection timeout spikes | Network or firewall | TCP connection duration | Check trace waterfalls for connect spans | Verify network rules, check firewall |
| 24 | Slow log queries | Log aggregation backlog | `log_write_duration_seconds` | Check log pipeline metrics | Increase log pipeline capacity |
| 25 | Container restart loop | OOM or crash loop | `kube_pod_container_status_restarts` | `kubectl logs --previous` | Fix root cause, increase limits |
| 26 | Stale reads | Cache serving old data | Cache TTL vs actual age | Compare cache timestamps with DB | Invalidate cache, reduce TTL |
| 27 | N+1 query pattern | Missing eager loading | `db_query_total` count per request | Compare query count with endpoint calls | Use DataLoader or JOIN queries |
| 28 | Cold start latency | Process startup time | First request after deploy | Measure time-to-first-response | Use keep-alive, pre-warm connections |

---

> **Remember**: The goal is not to prevent all issues — it is to detect them within minutes, diagnose them within hours, and fix them permanently. Observability is an investment that pays off every time something breaks at 3 AM.
