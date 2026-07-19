# How to Fix Frontend Caching Problems

> Production-ready solutions for every caching problem in React and Next.js applications. Every example uses real TypeScript.

---

## 1. staleTime vs gcTime

These two settings control React Query's cache lifecycle independently.

### staleTime

`staleTime` controls how long data is considered fresh. While data is fresh, React Query will **never** refetch it — not on remount, not on window focus, not on retry. It returns the cached data instantly.

```typescript
const { data } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId),
  staleTime: 1000 * 60 * 5, // 5 minutes — data is fresh for 5 min
});
```

### gcTime (formerly cacheTime)

`gcTime` controls how long **inactive** cached data is kept in memory after the last subscriber unmounts. Once gcTime expires, the data is garbage collected and the next mount will trigger a fresh fetch.

```typescript
const { data } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId),
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 30, // keep in memory for 30 min after unmount
});
```

### Recommended Values by Data Type

| Data Type | staleTime | gcTime | Reasoning |
|-----------|-----------|--------|-----------|
| User profile | 5 min | 30 min | Changes rarely, safe to cache aggressively |
| Product list | 30 sec | 5 min | Updates moderately, balance freshness with performance |
| Real-time prices | 0 | 0 | Must always be fresh, disable caching entirely |
| Dashboard stats | 1 min | 10 min | Semi-static, expensive to compute |
| Search results | 2 min | 5 min | Same query repeated often, acceptable staleness |

### Common Mistake

```typescript
// BAD: staleTime: 0 on everything — every mount triggers a network request
useQuery({ queryKey: ['products'], queryFn: fetchProducts, staleTime: 0 });

// GOOD: choose staleTime based on how fresh the data needs to be
useQuery({ queryKey: ['products'], queryFn: fetchProducts, staleTime: 30_000 });
```

---

## 2. Query Key Design

Query keys are not just identifiers — they encode the full parameter space of a query. Bad key design causes cache misses and invalidation bugs.

### Flat Keys Cause Bugs

```typescript
// BAD: flat key — cannot invalidate all products without invalidating everything
useQuery({ queryKey: ['products-active-true-page-1'], queryFn: fetchProducts });

// GOOD: structured key — can invalidate all products by prefix
useQuery({ queryKey: ['products', { active: true, page: 1 }], queryFn: fetchProducts });
```

### Key Structure Pattern

```typescript
// Always: [resource] for the base resource
// Add: filters as objects, IDs as primitives
['users']                                              // all users
['users', userId]                                      // single user
['users', { role: 'admin', page: 1 }]                  // filtered list
['users', userId, 'posts']                             // nested resource
['users', userId, 'posts', { page: 1, limit: 20 }]    // nested filtered
```

### Invalidation by Prefix

```typescript
// Invalidates ALL user queries (single user, filtered list, nested posts)
queryClient.invalidateQueries({ queryKey: ['users'] });

// Invalidates ONLY the specific user
queryClient.invalidateQueries({ queryKey: ['users', userId], exact: true });
```

### Why Keys Must Be Serializable

React Query uses JSON.stringify internally to compare keys. Functions, classes, or circular references in keys will cause incorrect cache behavior.

```typescript
// BAD: function in key
useQuery({ queryKey: ['data', () => computeParam()], queryFn: fetchData });

// GOOD: compute param outside, pass as primitive
const param = computeParam();
useQuery({ queryKey: ['data', param], queryFn: fetchData });
```

---

## 3. Optimistic Updates in React Query

Optimistic updates update the cache immediately before the server responds, then rollback on error.

### Full Pattern with TypeScript

```typescript
interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

function useToggleTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (todo: Todo) => {
      const res = await fetch(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !todo.completed }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      return res.json() as Promise<Todo>;
    },

    // 1. Optimistically update the cache before the request
    onMutate: async (todo) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['todos'] });

      // Snapshot the previous value
      const previousTodos = queryClient.getQueryData<Todo[]>(['todos']);

      // Optimistically update to the new value
      queryClient.setQueryData<Todo[]>(['todos'], (old) =>
        old?.map((t) => (t.id === todo.id ? { ...t, completed: !t.completed } : t))
      );

      // Return context with the snapshotted value
      return { previousTodos };
    },

    // 2. Rollback on error
    onError: (_err, _todo, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(['todos'], context.previousTodos);
      }
    },

    // 3. Always refetch after error or success to ensure server state
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });
}
```

---

## 4. Cache Invalidation After Mutations

### invalidateQueries vs setQueryData

| Method | When to Use | Tradeoff |
|--------|-------------|----------|
| `invalidateQueries` | When server is the source of truth | Triggers refetch, slightly delayed |
| `setQueryData` | When you already have the new data from the mutation response | Instant, but may diverge from server |

### invalidateQueries with Exact vs Prefix

```typescript
// Invalidate ALL queries whose key starts with ['todos']
queryClient.invalidateQueries({ queryKey: ['todos'] });

// Invalidate ONLY the exact key ['todos', { filter: 'completed' }]
queryClient.invalidateQueries({
  queryKey: ['todos', { filter: 'completed' }],
  exact: true,
});
```

### setQueryData for Instant Updates

```typescript
const createTodo = useMutation({
  mutationFn: (data: CreateTodoInput) => api.createTodo(data),
  onSuccess: (newTodo) => {
    // Instantly add the new todo to the list without refetching
    queryClient.setQueryData<Todo[]>(['todos'], (old) => {
      return old ? [...old, newTodo] : [newTodo];
    });
  },
});
```

### The Tradeoff

Use `setQueryData` when the mutation response contains the full updated object and you want instant UI feedback. Use `invalidateQueries` when you need to ensure consistency with server-side computed fields (counts, aggregations, derived data).

---

## 5. Prefetching Strategies

### On Hover

```typescript
function ProductLink({ id }: { id: string }) {
  const queryClient = useQueryClient();

  const prefetch = () => {
    queryClient.prefetchQuery({
      queryKey: ['product', id],
      queryFn: () => fetchProduct(id),
      staleTime: 1000 * 60, // 1 min — prefetch data should be fresh
    });
  };

  return (
    <Link
      href={`/products/${id}`}
      onMouseEnter={prefetch}
      onFocus={prefetch}
    >
      View Product
    </Link>
  );
}
```

### On Scroll Near Link (Intersection Observer)

```typescript
function LazyProductLink({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          queryClient.prefetchQuery({
            queryKey: ['product', id],
            queryFn: () => fetchProduct(id),
          });
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // prefetch 200px before visible
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [id, queryClient]);

  return (
    <Link ref={ref} href={`/products/${id}`}>
      View Product
    </Link>
  );
}
```

### Next.js Router-Level Prefetch

```typescript
// Next.js App Router — prefetch on link hover (built-in)
<Link href="/dashboard" prefetch={true}>
  Dashboard
</Link>

// Programmatic prefetch
import { useRouter } from 'next/navigation';

function PrefetchDashboard() {
  const router = useRouter();

  useEffect(() => {
    router.prefetch('/dashboard');
  }, [router]);

  return null;
}
```

---

## 6. SWR Configuration Defaults

### Key Settings Explained

| Setting | Default | Purpose |
|---------|---------|---------|
| `revalidateOnFocus` | `true` | Refetch when window regains focus |
| `revalidateIfStale` | `true` | Refetch if data is stale on mount |
| `dedupingInterval` | `2000` | Deduplicate identical requests within 2 seconds |
| `revalidateOnMount` | `undefined` | Override revalidateOnFocus for first mount |
| `focusThrottleInterval` | `5000` | Min interval between focus refetches |

### Custom Hook with Project Defaults

```typescript
import useSWR, { SWRConfiguration } from 'swr';

const DEFAULT_OPTIONS: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateIfStale: true,
  dedupingInterval: 5000,       // 5 seconds — avoid rapid refetches
  focusThrottleInterval: 10000, // 10 seconds between focus refetches
  errorRetryCount: 3,
};

export function useAppSWR<T>(
  key: string | null,
  fetcher: (url: string) => Promise<T>,
  options?: SWRConfiguration
) {
  return useSWR(key, fetcher, { ...DEFAULT_OPTIONS, ...options });
}

// Usage
const { data } = useAppSWR('/api/products', fetcher);
```

### Disabling Refetch for Static Data

```typescript
const { data } = useAppSWR('/api/config', fetcher, {
  revalidateOnFocus: false,
  revalidateIfStale: false,
  revalidateOnMount: false,
  dedupingInterval: Infinity, // never refetch same key
});
```

---

## 7. Service Worker Caching Strategies

### Cache First (Static Assets)

Use for versioned assets that never change: JS bundles, CSS, images.

```typescript
// workbox.config.js
module.exports = {
  globPatterns: ['**/*.{js,css,png,svg,woff2}'],
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/cdn\.example\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'cdn-cache',
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
  ],
};
```

### Network First (API Calls)

Always try the network, fall back to cache when offline.

```typescript
{
  urlPattern: /^\/api\/.*/i,
  handler: 'NetworkFirst',
  options: {
    cacheName: 'api-cache',
    networkTimeoutSeconds: 3, // fall back to cache after 3s
    expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
  },
}
```

### Stale-While-Revalidate (Semi-Dynamic)

Serve cached version immediately, update in background.

```typescript
{
  urlPattern: /^\/api\/products$/i,
  handler: 'StaleWhileRevalidate',
  options: {
    cacheName: 'products-cache',
    expiration: { maxEntries: 10, maxAgeSeconds: 60 * 5 },
  },
}
```

### Cache Only (Offline-First)

Never go to network — only serve from cache.

```typescript
{
  urlPattern: /^\/app-shell$/i,
  handler: 'CacheOnly',
  options: { cacheName: 'app-shell' },
}
```

### Network Only (Bypass)

Never cache — always go to network.

```typescript
{
  urlPattern: /^\/api\/auth\/.*/i,
  handler: 'NetworkOnly',
}
```

---

## 8. HTTP Cache Headers from Frontend Perspective

### Cache Busting

```typescript
// Append timestamp to force a fresh fetch
const res = await fetch(`/api/products?t=${Date.now()}`);

// Or use a cache-busting header
const res = await fetch('/api/products', {
  headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
});
```

### Conditional Requests with If-None-Match

```typescript
async function fetchWithETag(url: string, etag: string | null) {
  const headers: HeadersInit = {};
  if (etag) headers['If-None-Match'] = etag;

  const res = await fetch(url, { headers });

  if (res.status === 304) {
    return { data: null, etag, fromCache: true };
  }

  const newEtag = res.headers.get('ETag');
  const data = await res.json();
  return { data, etag: newEtag, fromCache: false };
}
```

### Force Full Reload

```typescript
// Clear all caches and reload
async function forceReload() {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  window.location.reload();
}
```

---

## 9. Infinite Query Caching

### How Page Cache Works

`useInfiniteQuery` stores each page separately in the cache under the same query key. Pages are identified by the `pageParam` value.

```typescript
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['products'],
  queryFn: ({ pageParam }) => fetchProducts(pageParam),
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});

// data.pages = [page1, page2, page3]
// Each page is independently cached and can be invalidated
```

### Keeping Scroll Position

```typescript
import { useLayoutEffect, useRef } from 'react';

function ProductList() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data } = useInfiniteQuery({ /* ... */ });

  // Save scroll position on unmount
  useLayoutEffect(() => {
    const saved = sessionStorage.getItem('product-scroll');
    if (saved && scrollRef.current) {
      scrollRef.current.scrollTop = parseInt(saved, 10);
    }

    const el = scrollRef.current;
    const saveScroll = () => {
      if (el) sessionStorage.setItem('product-scroll', String(el.scrollTop));
    };

    el?.addEventListener('scroll', saveScroll);
    return () => {
      saveScroll();
      el?.removeEventListener('scroll', saveScroll);
    };
  }, []);

  return <div ref={scrollRef}>{/* render pages */}</div>;
}
```

### Invalidating Specific Pages

```typescript
// Invalidate only the first page
queryClient.invalidateQueries({
  queryKey: ['products'],
  predicate: (query) => {
    const lastPage = query.state.data?.pages[0];
    return lastPage?.pageParam === 1;
  },
});
```

---

## 10. Reducing Cache Memory Footprint

### Selecting Only Needed Fields

```typescript
// BAD: caches entire product object including images and descriptions
const { data } = useQuery({ queryKey: ['products'], queryFn: fetchAllProducts });

// GOOD: select only the fields you need — derived query caches less
const { data } = useQuery({
  queryKey: ['products'],
  queryFn: fetchAllProducts,
  select: (products) => products.map(({ id, name, price }) => ({ id, name, price })),
});
```

### Structural Sharing

React Query uses structural sharing to reuse objects that haven't changed. If a refetch returns the same data, the old object reference is preserved, preventing unnecessary re-renders.

```typescript
// This component only re-renders if the product's name or price actually changed
function ProductCard({ product }: { product: Product }) {
  return <div>{product.name} — ${product.price}</div>;
}
```

### Configuring maxAge for Automatic Eviction

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 5 * 60 * 1000, // 5 minutes — evict after 5 min inactive
    },
  },
});

// Per-query override for expensive data
useQuery({
  queryKey: ['heavy-report'],
  queryFn: fetchHeavyReport,
  gcTime: 60 * 1000, // evict after 1 min — this data is large
});
```

---

> **Next:** See [detect.md](./detect.md) if you haven't run detection first. Then proceed to the project files in `./project/` for runnable implementations.
