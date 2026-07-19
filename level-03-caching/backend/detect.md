# How to Detect Backend Caching Problems

> A hands-on guide to finding and diagnosing caching issues in Node.js/NestJS backends using real tools, CLI commands, and instrumentation patterns.

---

## 1. The Backend Cache Hierarchy

Every backend request passes through multiple cache layers before hitting the database. Missing each layer has a different cost.

### In-Memory Process Cache (Map / LRU)

A JavaScript `Map` or an LRU library like `lru-cache` lives inside the Node.js process. It is the fastest cache — access time is < 1ms — but it is per-process. On a 4-instance deployment, each instance has its own copy. A miss here costs ~0.5ms (a Map lookup). The real cost is not speed but correctness: stale data if invalidation is not propagated across instances.

### Redis / Memcached

A shared cache accessed over TCP. Access time is 1-5ms for Redis on the same network, 5-20ms for Memcached. A miss here costs a full database round-trip (10-100ms). Redis also supports TTL, pub/sub for invalidation, and Lua scripting for atomic operations. Memcached is simpler and faster for pure key-value caching but lacks persistence and pub/sub.

### Database Query Cache

MySQL has a built-in query cache (disabled in 8.0+). PostgreSQL relies on `pg_prewarm` and OS page cache. A miss here costs disk I/O: 0.5-5ms for SSD, 5-50ms for HDD. For complex queries with joins, the real cost is CPU time for query planning and execution (10-500ms).

### HTTP Response Cache

The Express/NestJS response itself can be cached with `Cache-Control` headers, ETags, or middleware like `apicache`. A miss here means the server re-executes the full request handler: serialization, business logic, database queries, and response writing. Cost is the sum of all downstream operations.

### CDN Cache

Cloudflare, Fastly, or AWS CloudFront cache responses at the edge. Access time is < 1ms for a hit. A miss means the request travels to the origin (50-200ms depending on distance). CDN misses are the most expensive in terms of user-perceived latency and bandwidth cost.

---

## 2. Detecting Cache Miss Rate

### Instrumenting a Cache Layer

```typescript
class InstrumentedCache<K, V> {
  private cache = new Map<K, V>();
  private hits = 0;
  private misses = 0;
  private stale = 0;

  get(key: K): { value: V | undefined; status: 'hit' | 'miss' | 'stale' } {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.hits++;
      return { value, status: 'hit' };
    }
    this.misses++;
    return { value: undefined, status: 'miss' };
  }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      size: this.cache.size,
    };
  }
}
```

### Exposing as Prometheus Metrics

```typescript
import { Counter, Gauge, register } from 'prom-client';

const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['layer'],
});

const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['layer'],
});

const cacheSize = new Gauge({
  name: 'cache_size',
  help: 'Current cache size',
  labelNames: ['layer'],
});

// In your cache middleware:
cacheHits.inc({ layer: 'redis' });
cacheMisses.inc({ layer: 'redis' });
```

### Health Endpoint

```typescript
app.get('/health/cache', (req, res) => {
  res.json({
    redis: redisClient.getStats(),
    memory: memoryCache.getStats(),
    hitRateThreshold: 0.8,
    healthy: memoryCache.getHitRate() >= 0.8 && redisClient.getHitRate() >= 0.8,
  });
});
```

### What a Bad Hit Rate Looks Like

| Hit Rate | Assessment |
|----------|------------|
| > 95% | Excellent — cache is effective |
| 80-95% | Acceptable — monitor for degradation |
| 60-80% | Problem — investigate key design and TTL |
| < 60% | Critical — cache is nearly useless |

---

## 3. Redis Cache Analysis

### Check Hit Rate

```bash
redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses"
```

Output:
```
keyspace_hits:1234567
keyspace_misses:45678
```

Calculate: `1234567 / (1234567 + 45678) = 96.4%` — healthy.

### Live Request Stream

```bash
redis-cli MONITOR
```

Shows every command in real time. Useful for detecting unexpected patterns like excessive `KEYS *` scans or `FLUSHDB` commands.

### Simulate Slowness

```bash
redis-cli DEBUG SLEEP 1.0
```

Blocks the Redis server for 1 second. Useful for testing timeout handling and circuit breaker behavior. Use with caution in production.

### Slow Command Detection

```bash
redis-cli SLOWLOG GET 10
```

Shows the 10 slowest recently executed commands. Look for `KEYS`, `SORT`, or `LRANGE` on large lists.

### Live Monitoring

```bash
redis-cli --stat
```

Shows operations per second, hit rate, and memory usage in a live-updating terminal view.

---

## 4. Detecting Cache Stampede

### What It Is

When a popular cache key expires, all concurrent requests miss the cache and hit the origin simultaneously. This can overwhelm the database.

### How to Reproduce

1. Set a cache key with a short TTL (e.g. 5 seconds)
2. Use `artillery` or `k6` to send 100 requests/second
3. Wait for the key to expire
4. Observe the p99 spike at the exact expiry interval

```bash
artillery quick --count 1000 -n 100 http://localhost:3000/api/products
```

### What It Looks Like in Metrics

```
p99 latency: 50ms (normal) → 800ms (stampede) → 50ms (normal)
```

The spike repeats at the exact TTL interval. If your TTL is 60 seconds, you see a spike every 60 seconds.

### Detection in Code

```typescript
const cacheStampedeCounter = new Counter({
  name: 'cache_stampede_total',
  help: 'Number of cache stampede events detected',
});

// If more than N concurrent requests miss the same key within 100ms:
if (concurrentMisses.get(key)! > 5) {
  cacheStampedeCounter.inc();
}
```

---

## 5. HTTP Cache Header Debugging

### Check Headers with curl

```bash
curl -v http://localhost:3000/api/products 2>&1 | grep -i "cache-control\|etag\|last-modified\|age"
```

### What You Expect

```
< Cache-Control: public, max-age=60
< ETag: "abc123"
```

### What Bad Looks Like

```
< Cache-Control: no-cache    # revalidates every request
< Cache-Control: no-store    # never caches
# (missing entirely)         # browser/CDN cannot cache
```

### CDN Response Headers

```bash
curl -v https://cdn.example.com/api/products 2>&1 | grep -i "cf-cache-status\|x-cache\|age"
```

| Header | Good | Bad |
|--------|------|-----|
| `CF-Cache-Status: HIT` | Cached at edge | — |
| `CF-Cache-Status: MISS` | Not cached (expected for dynamic) | — |
| `CF-Cache-Status: EXPIRED` | Stale, being revalidated | — |
| `X-Cache: HIT from cloudfront` | Cached | — |
| `Age: 0` | Fresh | — |
| `Age: 86400` with `max-age: 3600` | — | Serving expired content |

### Vary Header Misuse

```bash
curl -v http://localhost:3000/api/products 2>&1 | grep -i vary
```

If `Vary: *` is set, the CDN creates a separate cache entry for every unique request — effectively disabling caching. `Vary: Accept-Encoding` is the most common correct value.

---

## 6. Detecting Cache Poisoning Risks

### Key Design Audit

```typescript
// DANGEROUS: User ID in the cache key — user A's data leaks to user B
// if they share the same cache key after a bug
function buildKey(userId: string, productId: string) {
  return `product:${productId}`; // missing userId!
}

// SAFE: User-scoped key
function buildKey(userId: string, productId: string) {
  return `user:${userId}:product:${productId}`;
}
```

### Detecting Leakage

Run a load test with two different user tokens hitting the same endpoint. If User A ever sees User B's data, you have a cache poisoning bug.

```bash
# Terminal 1: User A
curl -H "Authorization: Bearer tokenA" http://localhost:3000/api/profile

# Terminal 2: User B (simultaneously)
curl -H "Authorization: Bearer tokenB" http://localhost:3000/api/profile
```

If the response bodies ever match when they shouldn't, investigate the cache key derivation.

### Common Pitfalls

- Forgetting to include query params in the cache key (`/products?page=1` vs `/products?page=2` sharing a key)
- Using only the URL path without considering the `Vary` header
- Caching responses before authentication middleware runs

---

## 7. In-Memory Cache Limits

### Detecting High Eviction Rate

```typescript
import LRU from 'lru-cache';

const cache = new LRU<string, unknown>({
  max: 1000, // maximum entries
});

// Instrument evictions
const originalSet = cache.set.bind(cache);
let evictions = 0;

// Track eviction count (LRU-cache fires an 'evict' event in some versions)
// Or periodically check cache.size vs cache.calculatedSize
setInterval(() => {
  if (cache.size > cache.max * 0.95) {
    console.warn(`Cache near capacity: ${cache.size}/${cache.max}`);
  }
}, 10_000);
```

### Measuring Evictions

```typescript
const evictionCounter = new Counter({
  name: 'cache_evictions_total',
  help: 'Total cache evictions',
  labelNames: ['cache'],
});

// If using lru-cache with the 'dispose' callback:
const cache = new LRU({
  max: 1000,
  dispose: (value, key) => {
    evictionCounter.inc({ cache: 'memory' });
  },
});
```

### Sizing the Cache

The working set is the number of unique keys accessed within a time window. Measure it:

```typescript
const keysAccessed = new Set<string>();

// In your cache get/put:
keysAccessed.add(key);

// Every hour, log the working set size
setInterval(() => {
  console.log(`Working set size: ${keysAccessed.size}`);
  keysAccessed.clear();
}, 3_600_000);
```

If the working set is 5000 unique keys but your cache max is 1000, you will have constant evictions. Set max to at least 1.5x the working set.

---

## 8. Cache Warming Problems

### Detecting Cold Cache After Deploy

After a deploy, all in-memory caches are empty. The first requests after deploy hit the database directly. This shows up as a p99 spike at deploy time.

```bash
# Compare p99 before and after deploy
# Grafana query:
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

Look for a spike that correlates with deploy timestamps.

### Identifying Hot Keys

```typescript
const keyFrequency = new Map<string, number>();

// In your cache get:
keyFrequency.set(key, (keyFrequency.get(key) ?? 0) + 1);

// Every 5 minutes, log the top 20 keys
setInterval(() => {
  const sorted = [...keyFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  console.log('Hot keys:', sorted);
  keyFrequency.clear();
}, 300_000);
```

### Pre-warming Strategy

```typescript
// On deploy, fetch the top 100 keys into cache before accepting traffic
async function warmCache() {
  const hotKeys = await getHotKeysFromLogs();
  await Promise.all(
    hotKeys.map(async (key) => {
      const data = await fetchFromDatabase(key);
      await cache.set(key, data, { ttl: 60_000 });
    })
  );
  console.log(`Warmed ${hotKeys.length} keys`);
}
```

---

## 9. Distributed Cache Consistency

### The Problem

With 4 backend instances and no shared cache, each instance has its own in-memory copy. When Instance A updates a record, Instances B, C, and D still serve stale data.

### Detection

```typescript
// Add a cache version header to every response
app.use((req, res, next) => {
  res.setHeader('X-Cache-Version', process.env.DEPLOY_VERSION ?? 'unknown');
  res.setHeader('X-Instance-ID', process.env.INSTANCE_ID ?? 'unknown');
  next();
});
```

Compare responses from different instances:

```bash
# Hit instance 1
curl -v http://instance1:3000/api/products/1 | grep "X-Instance-ID"

# Hit instance 2
curl -v http://instance2:3000/api/products/1 | grep "X-Instance-ID"
```

If the data differs between instances, you have a consistency problem.

### Solutions to Detect

- Use Redis as a shared cache (all instances read/write the same keys)
- Use Redis pub/sub to broadcast invalidation events
- Use `Cache-Control: no-cache` on sensitive data (always revalidate)

---

## 10. Diagnostic Checklist

| # | Symptom | Cause | Where to Look | What You Expect |
|---|---------|-------|---------------|-----------------|
| 1 | High DB CPU after deploy | Cold cache | Deploy logs + DB metrics | CPU spike at deploy time |
| 2 | p99 spike every N seconds | Cache stampede at TTL expiry | Latency histogram | Spike at exact TTL interval |
| 3 | Redis hit rate < 80% | Bad key design or short TTL | `redis-cli INFO stats` | `keyspace_hits / (hits + misses)` > 0.8 |
| 4 | Different data from different instances | No shared cache | `X-Instance-ID` header | All instances return same data |
| 5 | User A sees User B's data | Cache key missing user scope | Cache key derivation code | Keys include user identifier |
| 6 | `Vary: *` on responses | Overly broad cache key | `curl -v` response headers | `Vary: Accept-Encoding` only |
| 7 | Cache evictions > 10/sec | Cache too small for working set | Eviction counter metric | `cache.max` > 1.5x working set |
| 8 | `CF-Cache-Status: BYPASS` | Origin not setting cache headers | Origin response headers | `Cache-Control: public, max-age=N` |
| 9 | 500ms+ response for cached endpoint | Cache middleware not applied | Middleware registration order | Cache middleware before route handler |
| 10 | Memory usage growing over time | In-memory cache never evicts | `process.memoryUsage().heapUsed` | Stable heap after warmup |
| 11 | `no-cache` on static assets | Wrong Cache-Control for assets | Response headers | `max-age=31536000, immutable` |
| 12 | `Age` > `max-age` in CDN | CDN serving expired content | CDN response headers | `Age` < `max-age` |
| 13 | Missing `ETag` header | Cannot revalidate efficiently | Response headers | `ETag` present on all GETs |
| 14 | `KEYS *` in SLOWLOG | Blocking command in production | `redis-cli SLOWLOG GET` | No `KEYS` in production code |
| 15 | Cache hit but stale data | TTL too long for data volatility | TTL config vs data update frequency | TTL < data change interval |
| 16 | `no-store` on API responses | Server disabling all caching | Response headers | Explicit `Cache-Control` policy |
| 17 | Duplicate cache entries per user | Cache key not including filters | Cache key builder | Key includes all query params |
| 18 | `DEBUG SLEEP` in SLOWLOG | Debug command left in production | `redis-cli SLOWLOG GET` | No debug commands in prod |
| 19 | High Redis memory usage | No TTL on keys | `redis-cli INFO memory` | All keys have TTL set |
| 20 | `FLUSHDB` in MONITOR | Dangerous command in code | `redis-cli MONITOR` | No flush commands in code |
| 21 | Cache warming taking > 30s | Pre-warming too many keys | Deploy logs | Warm top 100 keys only |
| 22 | 304 responses on every request | `no-cache` forcing revalidation | Response headers | `max-age` > 0 |
| 23 | `Cache-Control` missing on API | Server not setting headers | Response headers | Explicit policy on all routes |
| 24 | Inconsistent caching across routes | Middleware applied selectively | Route registration | Cache middleware on all routes |
| 25 | `s-maxage` ignored by CDN | Origin not setting CDN-specific TTL | CDN + origin headers | CDN respects `s-maxage` |

---

> **Next:** See [fix.md](./fix.md) for solutions, or go to the project files in `./project/` for runnable implementations.
