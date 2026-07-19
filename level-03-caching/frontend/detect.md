# How to Detect Frontend Caching Problems

> A hands-on guide to finding and diagnosing caching issues in React and Next.js applications using real browser DevTools and library-specific inspection tools.

---

## 1. The Frontend Cache Stack

Modern frontends have at least six distinct caching layers, each with its own eviction policy and invalidation mechanism.

### Browser Memory Cache

The fastest cache lives in the browser's in-memory store. Resources fetched recently or already in the document are kept here. They do not appear in the DevTools disk cache and are invisible in the Network panel for `200 (from memory cache)` responses. Memory cache is volatile — cleared on tab close and evicted under memory pressure. It has no explicit TTL; the browser decides when to drop entries based on LRU heuristics.

### HTTP Disk Cache

The disk cache persists across sessions and is keyed by URL plus Vary headers. It is governed by `Cache-Control`, `Expires`, and `ETag`/`Last-Modified` headers. The Network panel shows `200 (from disk cache)` for hits. This cache survives tab and browser restarts but is cleared by the user or by storage pressure. Chrome's disk cache has a ~50 MB default limit per origin in some configurations.

### Service Worker Cache

A service worker intercepts fetch events and can serve responses from a `CacheStorage` API. This is the most aggressive cache layer — it can serve stale content indefinitely if the worker does not implement network-first or stale-while-revalidate strategies. Detected in the Application tab under Cache Storage. The Network panel shows `(from service worker)` or `(from SW)`.

### In-Memory JavaScript State

React `useState`, `useReducer`, `useContext`, and stores like Zustand or Redux hold data in the JS heap. This data is not persisted by default and lives only for the component lifetime or the store lifetime. It is the fastest data source but must be manually synchronized with the server. There is no HTTP header or DevTools panel that automatically tracks this cache.

### Server-State Cache (React Query / SWR)

React Query and SWR maintain a client-side cache of server data, keyed by query keys. This cache has configurable `staleTime` (how long data is considered fresh) and `gcTime` (how long inactive cache entries are kept). Devtools show cache state, age, and status. This is the most common source of stale-data bugs in SPAs.

### CDN Edge Cache

Content Delivery Networks like Cloudflare, Fastly, or Vercel's edge cache sit between the client and the origin server. They add headers like `X-Cache`, `X-Cache-Hits`, `CF-Cache-Status`, and `Age`. Edge caches can serve stale content even after origin invalidation due to TTL propagation delays. Detected via response headers, not via browser DevTools.

---

## 2. Detecting Cache Misses

### Reading the Network Tab Size Column

The Size column in Chrome DevTools Network panel reveals where a resource was served from. Hover over the size value for a tooltip that shows the full breakdown.

| Size Value | Meaning |
|------------|---------|
| `(from memory cache)` | Served from browser memory cache |
| `(from disk cache)` | Served from HTTP disk cache |
| `(from service worker)` | Intercepted by a service worker |
| `(from prefetch cache)` | Served from `<link rel="prefetch">` |
| `B` (bytes) | Actually downloaded from network |

If a resource you expect to be cached shows a byte value, it is a cache miss. Click the Timing tab to see if it was a full request or a revalidation.

### Cache-Control Header Inspection

Click any request in the Network panel, go to Headers, and look for `Cache-Control` in the Response Headers section. Key directives:

| Directive | Meaning |
|-----------|---------|
| `no-store` | Do not cache at all |
| `no-cache` | Cache but revalidate before every use |
| `max-age=3600` | Cache is fresh for 3600 seconds |
| `must-revalidate` | Once expired, must revalidate with origin |
| `s-maxage=86400` | CDN-specific TTL (overrides max-age for shared caches) |
| `immutable` | Never changes — do not revalidate ever |

Bad example: `Cache-Control: no-cache` on a static image means the browser will revalidate every time, wasting a round-trip.

### Status 304 vs 200

| Status | Meaning |
|--------|---------|
| `200` | Full response returned (fresh or missing cache) |
| `304 Not Modified` | Revalidation succeeded — server confirms cached version is still valid |
| `200 (from disk cache)` | Served directly from cache without network request |

A `304` response is not inherently bad — it means the ETag/Last-Modified matched. But if you see many `304` responses in a rapid sequence, the cache TTL is too short or `no-cache` is being used unnecessarily.

---

## 3. React Query / SWR Cache Inspector

### React Query Devtools

Install `@tanstack/react-query-devtools` and render it in your app root. The devtools panel shows:

| Column | What It Shows |
|--------|---------------|
| Query Key | The unique identifier for each cached query |
| Status | `fresh`, `stale`, `fetching`, `paused`, or `inactive` |
| Data Updated | Timestamp of last successful fetch |
| Data Age | How long since last update relative to `staleTime` |
| Fetch Status | `idle` or `fetching` |

**Query states explained:**
- `fresh` — Data exists and is within `staleTime`. No refetch will occur.
- `stale` — Data exists but is beyond `staleTime`. Will refetch on remount or window focus.
- `fetching` — An active request is in flight.
- `paused` — Network is offline; query will retry when online.
- `inactive` — No components are subscribed. Will be garbage collected after `gcTime`.

### Reading staleTime and gcTime

Click any query row in the devtools to see its options. `staleTime` controls when data becomes stale. `gcTime` (formerly `cacheTime`) controls when inactive data is removed from memory. If `gcTime` is 5 minutes and a query becomes inactive, it stays in cache for 5 minutes before removal.

### SWR Global Config Inspection

SWR does not have a built-in devtools panel like React Query. Instead, use:

```typescript
import useSWR, { mutate } from 'swr';

// Log all cache keys
console.log('SWR cache keys:', Array.from(document.querySelectorAll('[data-swr]')));

// Or use SWR's global mutate to inspect
mutate('/api/products', undefined, { revalidate: false }); // silent read
```

The `swr-devtools` package provides a browser extension that shows cached data and mutation history.

---

## 4. Detecting Stale Data Problems

### Symptoms

1. User creates an item, but the list still shows the old count
2. User edits a record, navigates away, returns, and sees the old value
3. User sees different data in two components that should show the same thing

### Reproduction Steps

1. Open React Query devtools
2. Trigger a mutation (create/update/delete)
3. Check if dependent queries show `stale` or `fresh` status
4. If `fresh` — the mutation did not invalidate the query
5. If `stale` but the component still shows old data — the query is not refetching on window focus or remount

### Common Causes

```typescript
// BAD: Mutation does not invalidate the list query
const createProduct = useMutation({
  mutationFn: (data) => api.post('/products', data),
  // Missing: onSuccess invalidation
});

// GOOD: Mutation invalidates related queries
const createProduct = useMutation({
  mutationFn: (data) => api.post('/products', data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
  },
});
```

### Confirming with Devtools

1. Open Network tab
2. Trigger the mutation
3. Check if a GET request fires immediately after the POST completes
4. If no GET fires — the mutation is not invalidating the cache
5. If GET fires but returns 304 — the server-side data has not changed yet (possible race condition)

---

## 5. Over-fetching from State Cache

### Duplicate Queries

Two components mounting simultaneously may both trigger the same query. React Query deduplicates by query key, but if the keys differ (even slightly), you get duplicate network requests.

```typescript
// Component A
const { data } = useQuery({ queryKey: ['products', 'active'], queryFn: fetchProducts });

// Component B — slightly different key triggers a second request
const { data } = useQuery({ queryKey: ['products', { active: true }], queryFn: fetchProducts });
```

Check the Network tab: if you see two identical GET requests with different query parameters, you have a deduplication miss.

### Waterfall Queries

A waterfall occurs when query B depends on the result of query A, but both are fetched sequentially in the component body.

```typescript
// BAD: Waterfall — B waits for A
const { data: user } = useQuery({ queryKey: ['user'], queryFn: fetchUser });
const { data: posts } = useQuery({
  queryKey: ['posts', user?.id],
  queryFn: () => fetchPosts(user!.id),
  enabled: !!user, // waits for user to finish
});
```

Check the Network tab timeline: if the second request starts only after the first response arrives, you have a waterfall. The total time is sum of both requests instead of max of both.

---

## 6. Service Worker Cache Problems

### Inspecting Service Worker Cache

1. Open DevTools → Application tab → Cache Storage
2. Expand each cache bucket to see stored requests
3. Click any entry to see the Response body
4. Check the Service Workers section to see if a worker is active and intercepting

### Detecting Stale SW Serving Old Assets

1. Open DevTools → Application → Service Workers
2. Check the "Update on reload" checkbox
3. Reload the page
4. Compare the served assets with the actual files in your build output
5. If the served version differs — the SW cache is stale

### Network Tab Indicators

| Indicator | Meaning |
|-----------|---------|
| `(from service worker)` | Response served from SW cache |
| `200 (from SW)` | Same as above, older Chrome versions |
| `from disk cache` | SW did not intercept; fell through to browser cache |

If resources show `(from service worker)` but you expect fresh content, the SW is serving stale data. Check the SW code for caching strategies that do not implement revalidation.

---

## 7. HTTP Cache Header Analysis

### Headers and What They Mean

| Header | Purpose | Good Value | Bad Value |
|--------|---------|------------|-----------|
| `Cache-Control` | Controls caching behavior | `public, max-age=31536000, immutable` for static assets | `no-cache` for images |
| `ETag` | Unique resource identifier for revalidation | `"abc123"` (weak or strong) | Missing entirely |
| `Last-Modified` | Timestamp of last modification | `Wed, 18 Dec 2024 10:00:00 GMT` | Missing for dynamic content |
| `Vary` | Cache key varies by request header | `Accept-Encoding` | `*` (overly broad) |
| `Age` | Seconds since the CDN cached the response | `0-86400` | `> max-age` (serving expired) |

### Reading Headers in DevTools

1. Network tab → click a request → Headers tab
2. Scroll to Response Headers
3. Expand the section to see all headers

### Common Bad Patterns

- `Cache-Control: no-store` on a CSS file means no caching at all
- `ETag` missing on a JSON API means clients cannot revalidate efficiently
- `Vary: *` means a separate cache entry for every unique request — effectively disables caching
- `Age: 999999` with `max-age: 3600` means the CDN is serving content well past its TTL

---

## 8. Cache Size and Memory Pressure

### Measuring React Query Cache Size

React Query stores all cached data in memory. With hundreds of queries, this can consume significant heap space.

```typescript
// Measure cache size
const cache = queryClient.getCache();
console.log('Query cache size:', cache.getAll().length);

// Check memory usage
if (performance.memory) {
  console.log('Heap used:', performance.memory.usedJSHeapSize / 1048576, 'MB');
  console.log('Heap limit:', performance.memory.jsHeapSizeLimit / 1048576, 'MB');
}
```

### Detecting Heap Pressure

1. Open DevTools → Performance tab
2. Click Record, interact with the app, stop recording
3. Look at the Memory chart — repeated upward spikes indicate growing heap
4. Check the Allocation view for the largest allocations
5. If `queryClient` or `Map` appears in the top allocators — cache is growing unbounded

### Fixing Cache Bloat

```typescript
// Configure aggressive GC
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 60_000,        // 1 minute (was 5 minutes default)
      staleTime: 30_000,     // 30 seconds
    },
  },
});
```

---

## 9. Prefetch Problems

### Failed Prefetches

Prefetches can fail silently if:
- The prefetch URL is wrong or returns a 404
- The network is offline
- CORS headers are missing on the prefetch endpoint
- The service worker intercepts and caches a failed response

Check the Network tab for prefetch requests (usually triggered by `<Link>` or `router.prefetch()`). If the status is 4xx/5xx, the prefetch failed.

### Prefetches That Fire Too Late

If a prefetch starts after the user hovers a link, it may not finish before navigation. Check the Timing tab:

```
Stall: 0ms   Start: 1200ms   Waiting: 300ms   Download: 50ms
```

If the prefetch starts 1200ms after hover (on `pointerenter`), it is too late. Use `onPointerEnter` for early prefetching or prefetch on route mount.

### Over-Prefetching

Prefetching every possible route wastes bandwidth. In the Network tab, look for prefetch requests that complete but whose data is never used (no subsequent navigation triggers them). These are wasted bytes.

```typescript
// BAD: Prefetch everything on mount
useEffect(() => {
  router.prefetch('/dashboard');
  router.prefetch('/settings');
  router.prefetch('/reports');
}, []);

// GOOD: Prefetch on hover
<Link
  href="/dashboard"
  onMouseEnter={() => router.prefetch('/dashboard')}
>
```

---

## 10. Diagnostic Checklist

| # | Symptom | Cause | Where to Look | What You Expect |
|---|---------|-------|---------------|-----------------|
| 1 | Resource shows bytes instead of cache hit | Cache miss | Network tab Size column | `(from disk cache)` |
| 2 | `200` response for static asset | `Cache-Control: no-store` | Response headers | `max-age=31536000, immutable` |
| 3 | `304` on every request | `Cache-Control: no-cache` or short TTL | Response headers | `max-age` > 0 |
| 4 | Data shows old values after edit | Mutation not invalidating query | React Query devtools | Query should be `stale` |
| 5 | Two identical network requests | Query key mismatch | Network tab + query keys | Deduplicated to one request |
| 6 | Sequential request timeline | Waterfall query dependency | Network tab waterfall | Parallel requests |
| 7 | SW serving old content | No revalidation in SW strategy | Application → Cache Storage | SW should implement revalidation |
| 8 | `Age` > `max-age` | CDN serving expired content | Response headers | `Age` < `max-age` |
| 9 | High JS heap usage | Cache growing unbounded | Performance tab Memory | Stable heap after interaction |
| 10 | Prefetch never used | Over-prefetching | Network tab prefetch requests | Only hover-triggered prefetches |
| 11 | `Vary: *` on API response | Overly broad cache key | Response headers | `Vary: Accept-Encoding` |
| 12 | Missing `ETag` header | Cannot revalidate efficiently | Response headers | `ETag` present on all GET responses |
| 13 | `no-cache` on images | Revalidating on every load | Response headers | `Cache-Control: max-age=86400` |
| 14 | React Query shows `fresh` but data is wrong | `staleTime` too long | React Query devtools | Reduce `staleTime` |
| 15 | Memory cache hit invisible in Network | Normal behavior | Network panel | `(from memory cache)` is expected |
| 16 | CDN shows stale after deploy | Cache purge not propagated | CDN dashboard headers | `X-Cache: HIT` should turn to `MISS` |
| 17 | Prefetch returns 404 | Wrong URL in prefetch | Network tab response | Status 200 |
| 18 | SW intercepts API calls | Missing route exclusion in SW | SW code + Network tab | API routes should bypass SW |
| 19 | Duplicate SW cache entries | Multiple cache buckets | Application → Cache Storage | One entry per URL per bucket |
| 20 | `s-maxage` ignored | Origin does not set CDN headers | Response headers | CDN respects `s-maxage` |
| 21 | `Cache-Control` missing entirely | Server not setting headers | Response headers | Explicit `Cache-Control` on all responses |
| 22 | Prefetch on every render | Missing dependency array | Component code | Prefetch only on hover/mount |
| 23 | `immutable` on mutable content | Wrong cache hint | Response headers | Only use `immutable` for versioned assets |
| 24 | Browser shows old CSS after deploy | `no-cache` missing on HTML | HTML response headers | `Cache-Control: no-cache` on HTML |
| 25 | React Query GC time too long | Memory leak from inactive queries | `gcTime` config | Set `gcTime` to 5 minutes or less |

---

> **Next:** See [fix.md](./fix.md) for solutions to each problem, or go directly to the project files in `./project/` for runnable implementations.
