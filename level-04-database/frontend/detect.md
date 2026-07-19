# How to Detect Database Performance Problems from the Frontend

> A hands-on guide for frontend engineers to identify backend and database performance issues using browser DevTools, network analysis, and React Query DevTools.

---

## 1. Frontend vs Backend Bottlenecks

Before blaming the database, determine where the slowness actually lives. The three-step diagnosis uses two metrics: Time to First Byte (TTFB) and Total Blocking Time (TBT).

### Step 1: TTFB High = Server Problem

TTFB is the time between the browser sending a request and receiving the first byte of the response. It includes DNS, TCP, TLS, server processing, and database queries.

```
TTFB > 500ms → Server problem (database, compute, or network)
```

Open DevTools → Network → click the slow request → Timing tab. If "Waiting (TTFB)" is the largest segment, the server took too long to respond. The database is the most common cause of high TTFB for API requests.

### Step 2: TTFB Low but TBT High = Frontend Problem

If TTFB is < 200ms but Total Blocking Time is high, the browser is busy rendering, parsing JavaScript, or running expensive React re-renders.

```
TTFB < 200ms, TBT > 200ms → Frontend rendering problem
```

Check the Performance tab → look at long tasks (> 50ms) in the main thread.

### Step 3: TTFB Variable = DB/Cache Problem

If TTFB varies wildly for the same endpoint (sometimes 50ms, sometimes 2000ms), the database is likely the cause. Cache hits return fast; cache misses trigger slow queries.

```
TTFB variance > 10x → Database or cache inconsistency
```

### Quick Reference

| TTFB | TBT | Diagnosis |
|------|-----|-----------|
| High (> 500ms) | Low | Server/database slow |
| Low (< 200ms) | High (> 200ms) | Frontend rendering slow |
| Variable (50ms-2s) | Low | DB/cache inconsistency |
| High | High | Both frontend and backend need work |

---

## 2. Network Tab Analysis for API Performance

### Request Timing Breakdown

Click any request in the Network tab → Timing tab. Each phase tells you where time is spent.

| Phase | What It Means | Problem Indicator |
|-------|---------------|-------------------|
| Queued | Browser queue limit (6 per domain) | Too many concurrent requests |
| Stalled | Waiting for available connection | TCP connection pool exhausted |
| DNS Lookup | Resolving hostname | Slow DNS (use preconnect) |
| Initial Connection | TCP handshake | High latency to server |
| TLS | SSL/TLS negotiation | Slow TLS (use TLS 1.3) |
| Request Sent | Time to send request body | Large request payload |
| Waiting (TTFB) | Server processing time | **Database/query slow** |
| Content Download | Receiving response body | Large response payload |

### How to Read It

1. Open DevTools → Network tab
2. Click the slow request
3. Go to Timing tab
4. Find the widest colored bar
5. That's your bottleneck

If "Waiting (TTFB)" is > 500ms, the server is slow. If "Content Download" is > 200ms, the response is too large.

---

## 3. Detecting N+1 from the Frontend

### What N+1 Looks Like in the Network Waterfall

N+1 occurs when the frontend triggers one request that returns a list, then the UI makes individual requests for each item's details.

Example: a product list returns 50 items, and the UI then fetches the category name for each product individually. That's 51 requests: 1 for the list + 50 for categories.

### Detection Steps

1. Open Network tab
2. Load the page
3. Count the number of requests to the same API pattern
4. Look for a "staircase" pattern in the waterfall (each request starts after the previous one finishes)

```
Request 1: GET /api/products          → 200ms
Request 2: GET /api/categories/1      → 150ms  (starts after Req 1)
Request 3: GET /api/categories/2      → 140ms  (starts after Req 2)
Request 4: GET /api/categories/3      → 160ms  (starts after Req 3)
...
Request 50: GET /api/categories/49    → 130ms  (starts after Req 49)
```

Total time: ~7500ms (sequential). With parallel: ~200ms.

### Count API Calls Per Page Load

In the Network tab, use the filter bar:

```
/api/   → shows all API calls
```

Count the results. For a product list page, you should see 1-3 API calls. If you see 50+, you have an N+1 problem.

---

## 4. Detecting Over-fetching

### Response Size vs Rendered Data Ratio

1. Open Network tab → click the API response
2. Go to Preview tab → count the fields in each object
3. Compare with what the UI actually renders

```
API returns: id, name, price, category, description, images, reviews, 
             specifications, shipping, returnPolicy, relatedProducts
UI renders:  id, name, price
```

The API is returning 12 fields; the UI uses 3. That's 75% over-fetching.

### Measuring Payload Size

1. Network tab → click the request → Headers tab
2. Check "Content-Length" or the Size column
3. If a list endpoint returns > 500KB for 20 items, investigate

```
GET /api/products?page=1 → 2.3MB response, UI shows name + price
```

### Solutions to Suggest to Backend

- Implement sparse fieldsets: `?fields=id,name,price`
- Create a lightweight endpoint for list views
- Use GraphQL instead of REST for flexible field selection

---

## 5. Detecting Pagination Problems

### Offset Pagination Degradation

Offset pagination (`?page=100&limit=20`) gets slower as the page number increases because the database must scan and discard all preceding rows.

### How to Detect

1. Load page 1 → note the TTFB (e.g. 80ms)
2. Load page 50 → note the TTFB (e.g. 120ms)
3. Load page 200 → note the TTFB (e.g. 2500ms)

If TTFB grows linearly with page number, the backend is using offset pagination.

### Visualization in DevTools

```javascript
// Console: time page loads for different offsets
for (const page of [1, 10, 50, 100, 200]) {
  const start = performance.now();
  await fetch(`/api/products?page=${page}&limit=20`);
  console.log(`Page ${page}: ${(performance.now() - start).toFixed(0)}ms`);
}
```

If page 200 is > 10x slower than page 1, suggest cursor-based pagination to the backend.

---

## 6. WebSocket and Real-time Data

### Detecting Polling Instead of WebSockets

Open the Network tab and look for repeated identical requests at regular intervals:

```
12:00:00.000  GET /api/notifications  → 200
12:00:05.000  GET /api/notifications  → 200
12:00:10.000  GET /api/notifications  → 200
12:00:15.000  GET /api/notifications  → 200
```

If you see the same request repeating every N seconds, that's polling.

### Impact Analysis

Count the polling requests over 1 minute:

```
Polling every 5s = 12 requests/minute
Polling every 1s = 60 requests/minute
Polling every 100ms = 600 requests/minute (!!)
```

### Suggest WebSocket Upgrade

When you see polling, suggest the backend implement WebSockets or Server-Sent Events. The network tab will show a single "ws://" connection instead of dozens of HTTP requests.

---

## 7. Request Waterfall vs Parallel

### Sequential Fetching Problem

React components that fetch data in `useEffect` often create waterfalls:

```typescript
// BAD: Sequential — B waits for A
const { data: user } = useQuery({ queryKey: ['user'], queryFn: fetchUser });
const { data: posts } = useQuery({
  queryKey: ['posts', user?.id],
  queryFn: () => fetchPosts(user!.id),
  enabled: !!user,
});
```

Network tab shows:
```
GET /api/user      0ms ────────── 200ms
                   GET /api/posts  200ms ────────── 400ms
Total: 400ms
```

### Parallel Fetching

```typescript
// GOOD: Parallel — both start immediately
const { data: user } = useQuery({ queryKey: ['user'], queryFn: fetchUser });
const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats });
```

Network tab shows:
```
GET /api/user   0ms ────────── 200ms
GET /api/stats  0ms ────────── 150ms
Total: 200ms (not 350ms)
```

### React Query DevTools

Open React Query DevTools → look at the query timeline. If queries start at different times and each begins only after the previous one resolves, you have a waterfall.

---

## 8. Slow Mutation Detection

### Comparing Mutation Timing to Query Timing

In the Network tab, compare POST/PUT/DELETE timing with GET timing for the same resource:

```
GET  /api/products/1    → TTFB: 30ms   (read)
POST /api/products/1    → TTFB: 2500ms (write)
```

If writes are > 5x slower than reads, the backend may have:
- Database lock contention
- Missing indexes on write paths
- Expensive validation or trigger logic
- Synchronous side effects (email, search index update)

### Detection Pattern

1. Trigger a mutation (create/update/delete)
2. Check the mutation's TTFB in Network tab
3. Compare with a read of the same resource
4. If mutation TTFB > 500ms consistently, report to backend

---

## 9. Error Rate and Retry Analysis

### Timeout Errors

503 (Service Unavailable) and 504 (Gateway Timeout) indicate the server or database is overwhelmed.

```
GET /api/products → 503  (server overloaded)
GET /api/products → 504  (database query timeout)
```

### Retry Storms

React Query and SWR automatically retry failed requests. This can amplify backend problems:

```
12:00:00  GET /api/products → 503
12:00:01  GET /api/products → 503  (retry 1)
12:00:03  GET /api/products → 503  (retry 2)
12:00:07  GET /api/products → 503  (retry 3)
```

In the Network tab, look for identical requests with increasing intervals — that's exponential backoff from retries.

### Detection

1. Sort Network tab by status
2. Filter for 5xx responses
3. Count retry patterns (same URL, increasing time gaps)
4. Report to backend with timestamps

---

## 10. Diagnostic Checklist

| # | Symptom | Likely Cause | Where to Look | What You Expect |
|---|---------|-------------|---------------|-----------------|
| 1 | TTFB > 1s on API calls | Slow DB query | Network tab → Timing → TTFB | TTFB < 200ms |
| 2 | TTFB varies wildly (50ms-3s) | Cache miss hitting DB | Network tab → compare TTFBs | Consistent TTFB |
| 3 | 50+ requests per page load | N+1 query problem | Network tab → request count | 1-3 API calls |
| 4 | Response > 1MB for list endpoint | Over-fetching | Network tab → Size column | < 200KB |
| 5 | Pagination slow at high pages | Offset pagination | Test page 1 vs page 200 | Same TTFB |
| 6 | Same request repeating every Ns | Polling instead of WebSocket | Network tab → filter by URL | Single WebSocket connection |
| 7 | Requests start sequentially | Waterfall fetching | Network tab → waterfall view | Parallel requests |
| 8 | Mutation TTFB > 500ms | DB lock or slow write | Network tab → POST/PUT timing | Mutation < 200ms |
| 9 | 503/504 errors | Server/DB overload | Network tab → status filter | 200 status |
| 10 | Retry storms (exponential backoff) | Backend failure cascading | Network tab → duplicate URLs | No retries |
| 11 | "Stalled" phase > 200ms | Connection pool exhausted | Network tab → Timing → Stalled | Stalled < 50ms |
| 12 | "Content Download" > 500ms | Response too large | Network tab → Timing → Download | Download < 100ms |
| 13 | TBT > 300ms with low TTFB | Frontend parsing overhead | Performance tab → long tasks | TBT < 200ms |
| 14 | Request queued > 100ms | Too many concurrent requests | Network tab → Timing → Queued | Queued < 20ms |
| 15 | TLS negotiation > 200ms | Slow TLS handshake | Network tab → Timing → TLS | TLS < 50ms |
| 16 | DNS lookup > 100ms | Missing preconnect | Network tab → Timing → DNS | DNS < 20ms |
| 17 | API returns 429 (rate limit) | Too many requests from client | Network tab → status 429 | No rate limiting |
| 18 | WebSocket disconnects frequently | Backend instability | Network tab → ws frames | Stable connection |
| 19 | Large request body on POST | Over-sending to server | Network tab → request payload | Payload < 50KB |
| 20 | Inconsistent response times across users | DB not using indexes | Compare timings from different users | Consistent performance |

---

> **Next:** See [fix.md](./fix.md) for frontend-side solutions, or go to the project files in `./project/` for runnable implementations.
