# How to Fix Backend Caching Problems

> Production-ready solutions for every caching problem in Node.js/NestJS backends. Every example is TypeScript with NestJS context.

---

## 1. Cache-Aside Pattern

Cache-aside (lazy loading) is the most common and safest caching pattern. The application is responsible for both reading and writing the cache.

### Read Path

```typescript
async getProduct(id: string): Promise<Product> {
  // 1. Check cache first
  const cached = await this.cache.get<Product>(`product:${id}`);
  if (cached) return cached;

  // 2. Cache miss — fetch from database
  const product = await this.productRepository.findOne({ where: { id } });
  if (!product) throw new NotFoundException(`Product ${id} not found`);

  // 3. Store in cache for next time
  await this.cache.set(`product:${id}`, product, { ttl: 300 });

  return product;
}
```

### Write Path — Invalidate, Don't Update

```typescript
async updateProduct(id: string, dto: UpdateProductDto): Promise<Product> {
  // 1. Update the database first (source of truth)
  const product = await this.productRepository.save({ id, ...dto });

  // 2. Invalidate the cache (don't try to update it)
  await this.cache.del(`product:${id}`);

  return product;
}
```

### Why Write-Through Is Usually Wrong

Write-through updates the cache at the same time as the database. The problem: if the cache update succeeds but the DB write fails (or vice versa), you have inconsistent data. Cache-aside avoids this by always treating the DB as the source of truth and only invalidating the cache on writes. The next read will repopulate the cache with fresh data.

---

## 2. Redis in NestJS

### Installation

```bash
npm install cache-manager cache-manager-redis-store@2
```

### Module Setup

```typescript
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { createKeyGenerator } from 'cache-manager-keygen';

@Module({
  imports: [
    CacheModule.registerAsync({
      useFactory: () => ({
        store: 'redis',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        ttl: 300_000, // 5 minutes in milliseconds (cache-manager v5+)
        keyPrefix: 'perf:', // all keys start with "perf:"
        // Max key length to prevent Redis errors
        maxKeySize: 256,
      }),
    }),
  ],
})
export class AppModule {}
```

### Custom Serialization

```typescript
CacheModule.registerAsync({
  useFactory: () => ({
    store: 'redis',
    host: 'localhost',
    ttl: 300_000,
    // Custom serialization for non-JSON-safe values
    serialize: (value: unknown) => JSON.stringify(value),
    deserialize: (value: string) => JSON.parse(value),
  }),
}),
```

### Usage in Service

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class ProductService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  async get(id: string): Promise<Product | undefined> {
    return this.cache.get<Product>(`product:${id}`);
  }

  async set(id: string, product: Product): Promise<void> {
    await this.cache.set(`product:${id}`, product, 300_000);
  }

  async del(id: string): Promise<void> {
    await this.cache.del(`product:${id}`);
  }
}
```

---

## 3. Cache Key Design

### Namespace Pattern

```
namespace:resource:id:version

Examples:
  product:123:v1
  user:456:orders:v2
  category:list:{"page":1,"sort":"name"}:v1
```

### Collision-Free Key Builder

```typescript
function buildCacheKey(
  namespace: string,
  id: string | number,
  filters?: Record<string, unknown>,
  version = 'v1'
): string {
  let key = `${namespace}:${id}`;

  if (filters && Object.keys(filters).length > 0) {
    // Sort keys to ensure consistent serialization
    const sorted = Object.keys(filters)
      .sort()
      .reduce((acc, k) => {
        acc[k] = filters[k];
        return acc;
      }, {} as Record<string, unknown>);
    key += `:${JSON.stringify(sorted)}`;
  }

  return `${key}:${version}`;
}

// Usage
buildCacheKey('product', 123);
// → "product:123:v1"

buildCacheKey('product', 'list', { page: 1, sort: 'name' });
// → 'product:list:{"page":1,"sort":"name"}:v1'
```

### Versioning for Bulk Invalidation

```typescript
// Bump the version to invalidate ALL keys for a resource
async invalidateAllProducts(): Promise<void> {
  // Option 1: Use a pattern delete (Redis SCAN + DEL)
  const keys = await this.redis.keys('perf:product:*');
  if (keys.length > 0) {
    await this.redis.del(...keys);
  }
}

// Option 2: Use a version counter stored in Redis
async getProductCacheVersion(): Promise<number> {
  return (await this.redis.get('perf:product:version')) ?? 0;
}
```

---

## 4. Preventing Cache Stampede

### Mutex Lock Pattern

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class StampedeProtection {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    // 1. Check cache
    const cached = await this.cache.get<T>(key);
    if (cached !== undefined && cached !== null) return cached;

    // 2. Try to acquire the lock
    const lockKey = `lock:${key}`;
    const lockTtl = 10_000; // 10 second lock timeout
    const acquired = await this.acquireLock(lockKey, lockTtl);

    if (!acquired) {
      // Another request is fetching — wait and retry
      await new Promise((r) => setTimeout(r, 100));
      return this.getOrFetch(key, fetcher, ttl);
    }

    try {
      // 3. Fetch from origin
      const data = await fetcher();

      // 4. Store in cache with staggered TTL (jitter)
      const jitteredTtl = ttl + Math.floor(Math.random() * ttl * 0.1);
      await this.cache.set(key, data, jitteredTtl);

      return data;
    } finally {
      // 5. Release the lock
      await this.releaseLock(lockKey);
    }
  }

  private async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    // SET NX = set if not exists, PX = expiry in milliseconds
    const result = await (this.cache as any).store?.client?.set(
      key,
      '1',
      'PX',
      ttlMs,
      'NX'
    );
    return result === 'OK';
  }

  private async releaseLock(key: string): Promise<void> {
    await (this.cache as any).store?.client?.del(key);
  }
}
```

### Staggered TTLs

```typescript
// Add random jitter to prevent all keys expiring simultaneously
function jitteredTtl(baseTtl: number, jitterPercent = 0.1): number {
  const jitter = Math.floor(baseTtl * jitterPercent * Math.random());
  return baseTtl + jitter;
}

// All keys expire at slightly different times
await cache.set('key1', data, jitteredTtl(300)); // 270-330 seconds
await cache.set('key2', data, jitteredTtl(300)); // 270-330 seconds
```

---

## 5. Cache Invalidation Strategies

### TTL-Based (Simple but Staleness)

```typescript
// Set a fixed TTL — data becomes stale after this time
await this.cache.set(key, data, 300_000); // 5 minutes

// Pro: Simple, self-healing
// Con: Stale data until TTL expires
```

### Event-Based (Pub/Sub Invalidation)

```typescript
// Publisher — on data change
async updateProduct(id: string, dto: UpdateProductDto) {
  const product = await this.productRepository.save({ id, ...dto });

  // Notify all instances to invalidate their cache
  await this.redis.publish('cache:invalidate', JSON.stringify({
    namespace: 'product',
    id,
  }));

  return product;
}

// Subscriber — on each instance
async onModuleInit() {
  const subscriber = this.redis.duplicate();
  await subscriber.subscribe('cache:invalidate', (message) => {
    const { namespace, id } = JSON.parse(message);
    this.cache.del(`${namespace}:${id}`);
  });
}
```

### Tag-Based Invalidation

```typescript
// Store tags alongside the cache entry
async setWithTag(key: string, value: unknown, tags: string[], ttl: number) {
  await this.cache.set(key, value, ttl);

  // Store the key in a tag set
  for (const tag of tags) {
    await this.redis.sadd(`tag:${tag}`, key);
    await this.redis.expire(`tag:${tag}`, ttl);
  }
}

// Invalidate all keys with a specific tag
async invalidateTag(tag: string) {
  const keys = await this.redis.smembers(`tag:${tag}`);
  if (keys.length > 0) {
    await this.cache.del(...keys);
  }
  await this.redis.del(`tag:${tag}`);
}

// Usage: invalidate all products for user 123
await this.invalidateTag('user:123:products');
```

---

## 6. HTTP Cache Headers from the Server

### Express Middleware

```typescript
import { Request, Response, NextFunction } from 'express';

function cacheHeaders(maxAge: number, options: {
  public?: boolean;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
  mustRevalidate?: boolean;
} = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const directives: string[] = [];

    directives.push(options.public !== false ? 'public' : 'private');
    directives.push(`max-age=${maxAge}`);

    if (options.sMaxAge) directives.push(`s-maxage=${options.sMaxAge}`);
    if (options.staleWhileRevalidate) {
      directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
    }
    if (options.mustRevalidate) directives.push('must-revalidate');

    res.setHeader('Cache-Control', directives.join(', '));
    next();
  };
}

// Static assets — aggressive caching (content-hashed)
app.use('/_next/static', cacheHeaders(31_536_000, { public: true }));

// API — moderate caching with revalidation
app.use('/api/products', cacheHeaders(60, {
  public: true,
  sMaxAge: 300,
  staleWhileRevalidate: 60,
}));

// User-specific — private, short TTL
app.use('/api/profile', cacheHeaders(30, { public: false }));
```

### Directive Reference

| Directive | Purpose | When to Use |
|-----------|---------|-------------|
| `public` | CDN and browser can cache | Static assets, public API |
| `private` | Only browser can cache | User-specific data |
| `max-age=N` | Fresh for N seconds | All cacheable responses |
| `s-maxage=N` | CDN-specific TTL (overrides max-age) | API responses via CDN |
| `stale-while-revalidate=N` | Serve stale for N seconds while revalidating | Semi-dynamic data |
| `must-revalidate` | Never serve stale content | Critical data (auth, payments) |

---

## 7. ETag Implementation

### Generating ETags

```typescript
import { createHash } from 'crypto';

function generateETag(data: unknown): string {
  const hash = createHash('md5')
    .update(JSON.stringify(data))
    .digest('hex');
  return `"${hash}"`;
}

// Usage in middleware
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body: unknown) => {
    const etag = generateETag(body);
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

### When ETags Are Better Than max-age

ETags are ideal when:
- Data changes unpredictably (user profiles, order status)
- You want instant detection of changes without waiting for TTL expiry
- The same resource is accessed by multiple clients who need consistency

max-age is better when:
- Data changes rarely (static assets, reference data)
- You want to eliminate server round-trips entirely
- Bandwidth is the primary concern

---

## 8. CDN Configuration

### Cloudflare Cache Rules

```json
{
  "rules": [
    {
      "expression": "http.path eq '/api/products'",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl": 60,
        "browser_ttl": 30
      }
    },
    {
      "expression": "http.path begins_with '/_next/static/'",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl": 31536000,
        "browser_ttl": 31536000
      }
    }
  ]
}
```

### Purging by Tag (Surrogate Keys)

```typescript
// Cloudflare API — purge by surrogate key
async function purgeSurrogateKey(tag: string) {
  await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tags: [tag] }),
  });
}

// Set surrogate key in response
app.use((req, res, next) => {
  res.setHeader('Surrogate-Key', 'products');
  next();
});
```

---

## 9. Local LRU Cache for Hot Data

### lru-cache Setup

```typescript
import LRU from 'lru-cache';

const cache = new LRU<string, Product>({
  max: 500,                     // maximum entries
  ttl: 1000 * 60 * 5,          // 5 minutes
  maxSize: 50 * 1024 * 1024,   // 50 MB memory limit
  sizeCalculation: (value) => {
    return Buffer.byteLength(JSON.stringify(value), 'utf-8');
  },
  // Evict least recently used when maxSize is reached
  dispose: (value, key) => {
    console.log(`Evicted: ${key}`);
  },
});
```

### When to Use In-Process vs Redis

| Factor | In-Process LRU | Redis |
|--------|----------------|-------|
| Latency | < 1ms | 1-5ms |
| Shared across instances | No | Yes |
| Memory limited | Yes (process heap) | Yes (Redis maxmemory) |
| Persistence | No | Optional (RDB/AOF) |
| Best for | Hot data, read-heavy, single instance | Shared state, distributed systems |

---

## 10. Cache Warming Strategy

### On Startup

```typescript
import { OnModuleInit } from '@nestjs/common';

@Injectable()
export class CacheWarmingService implements OnModuleInit {
  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    private productRepo: ProductRepository,
  ) {}

  async onModuleInit() {
    // Warm the cache in the background — don't block startup
    this.warmCache().catch((err) =>
      console.error('Cache warming failed:', err)
    );
  }

  private async warmCache() {
    const start = Date.now();
    const topProducts = await this.productRepo.find({
      order: { viewCount: 'DESC' },
      take: 100,
    });

    await Promise.all(
      topProducts.map(async (product) => {
        const key = `product:${product.id}`;
        await this.cache.set(key, product, jitteredTtl(300));
      })
    );

    console.log(`Cache warmed: ${topProducts.length} keys in ${Date.now() - start}ms`);
  }
}
```

### Proactive Refresh (Refresh-Ahead)

```typescript
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CacheRefreshService {
  @Cron(CronExpression.EVERY_4_MINUTES)
  async refreshHotKeys() {
    // Refresh keys that are about to expire (TTL = 5 min)
    const hotKeys = ['product:list:featured', 'categories:all'];

    for (const key of hotKeys) {
      const ttl = await this.cache.getTtl(key);
      if (ttl !== undefined && ttl < 60) {
        // Less than 60 seconds remaining — refresh now
        const data = await this.fetchForKey(key);
        await this.cache.set(key, data, 300_000);
      }
    }
  }
}
```

---

> **Next:** See [detect.md](./detect.md) if you haven't run detection first. Then proceed to the project files in `./project/` for runnable implementations.
