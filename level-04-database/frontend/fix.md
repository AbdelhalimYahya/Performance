# How to Fix Database/API Performance from the Frontend

> Production-ready patterns for reducing database load and improving perceived performance from the client side.

---

## 1. Request Parallelization

### Promise.all vs Sequential Await

Sequential await forces requests to run one after another. Promise.all runs them concurrently.

```typescript
// BAD: Sequential — total time = sum of all requests
const users = await fetchUsers();       // 200ms
const products = await fetchProducts(); // 150ms
const orders = await fetchOrders();     // 100ms
// Total: 450ms

// GOOD: Parallel — total time = max of all requests
const [users, products, orders] = await Promise.all([
  fetchUsers(),
  fetchProducts(),
  fetchOrders(),
]);
// Total: 200ms
```

### React Query useQueries for Parallel Fetching

```typescript
import { useQueries } from '@tanstack/react-query';

function Dashboard() {
  const results = useQueries({
    queries: [
      { queryKey: ['users'], queryFn: fetchUsers },
      { queryKey: ['products'], queryFn: fetchProducts },
      { queryKey: ['stats'], queryFn: fetchStats },
    ],
  });

  const [users, products, stats] = results;

  if (results.some((r) => r.isLoading)) return <Skeleton />;
  if (results.some((r) => r.isError)) return <Error />;

  return <DashboardView users={users.data} products={products.data} stats={stats.data} />;
}
```

### Redesigning Component Trees for Parallel Fetching

```typescript
// BAD: Nested dependencies create waterfalls
function Page() {
  const { data: user } = useQuery({ queryKey: ['user'], queryFn: fetchUser });
  // Component B waits for user to load
  return <Dashboard userId={user?.id} />;
}

function Dashboard({ userId }) {
  const { data: orders } = useQuery({
    queryKey: ['orders', userId],
    queryFn: () => fetchOrders(userId),
    enabled: !!userId, // waits for user
  });
}

// GOOD: Lift the query up, pass data down
function Page() {
  const { data: user } = useQuery({ queryKey: ['user'], queryFn: fetchUser });
  const { data: orders } = useQuery({
    queryKey: ['orders', user?.id],
    queryFn: () => fetchOrders(user!.id),
    enabled: !!user,
  });

  return <Dashboard user={user} orders={orders} />;
}
```

---

## 2. Cursor-based Pagination UI

### Building a Cursor-Based Pagination Component

```typescript
import { useState, useCallback } from 'react';

interface CursorPaginationProps {
  initialCursor?: string;
  onPageChange: (cursor: string | null) => void;
}

function CursorPagination({ initialCursor, onPageChange }: CursorPaginationProps) {
  const [history, setHistory] = useState<(string | null)[]>([initialCursor ?? '']);
  const [currentIndex, setCurrentIndex] = useState(0);

  const goNext = useCallback((nextCursor: string) => {
    setHistory((prev) => [...prev.slice(0, currentIndex + 1), nextCursor]);
    setCurrentIndex((i) => i + 1);
    onPageChange(nextCursor);
  }, [currentIndex, onPageChange]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      onPageChange(history[currentIndex - 1]);
    }
  }, [currentIndex, history, onPageChange]);

  const canGoNext = currentIndex < history.length - 1;
  const canGoPrev = currentIndex > 0;

  return (
    <div className="flex gap-2">
      <button onClick={goPrev} disabled={!canGoPrev} className="px-3 py-1 border rounded disabled:opacity-50">
        Previous
      </button>
      <span className="px-3 py-1">Page {currentIndex + 1}</span>
      <button onClick={() => {/* next handled by parent via onEndReached */}} disabled={!canGoNext} className="px-3 py-1 border rounded disabled:opacity-50">
        Next
      </button>
    </div>
  );
}
```

### Preserving Scroll Position

```typescript
import { useRef, useLayoutEffect } from 'react';

function ScrollPreservedList({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedPosition = useRef(0);

  // Save position before unmount
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const save = () => {
      savedPosition.current = el.scrollTop;
      sessionStorage.setItem('list-scroll', String(el.scrollTop));
    };

    el.addEventListener('scroll', save, { passive: true });
    return () => {
      save();
      el.removeEventListener('scroll', save);
    };
  }, []);

  // Restore position on mount
  useLayoutEffect(() => {
    const saved = sessionStorage.getItem('list-scroll');
    if (saved && scrollRef.current) {
      scrollRef.current.scrollTop = parseInt(saved, 10);
    }
  }, []);

  return <div ref={scrollRef} className="h-[80vh] overflow-y-auto">{children}</div>;
}
```

---

## 3. Infinite Scroll with React Query

### useInfiniteQuery Setup

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';

function useInfiniteProducts() {
  return useInfiniteQuery({
    queryKey: ['products'],
    queryFn: ({ pageParam }) => fetchProducts(pageParam),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
```

### IntersectionObserver Trigger

```typescript
import { useRef, useCallback } from 'react';

function InfiniteProductList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteProducts();
  const observer = useRef<IntersectionObserver | null>(null);

  const lastElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingNextPage) return;

      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && hasNextPage) {
            fetchNextPage();
          }
        },
        { rootMargin: '200px' } // trigger 200px before visible
      );

      if (node) observer.current.observe(node);
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage]
  );

  const items = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div>
      {items.map((item, i) => (
        <div key={item.id} ref={i === items.length - 1 ? lastElementRef : undefined}>
          {item.name}
        </div>
      ))}
      {isFetchingNextPage && <div className="p-4 text-center">Loading more...</div>}
      {!hasNextPage && items.length > 0 && <div className="p-4 text-center text-gray-400">End of results</div>}
    </div>
  );
}
```

---

## 4. Eliminating N+1 from the Frontend

### Request Batching Pattern

Collect multiple IDs over one tick and send a single batch request.

```typescript
class RequestBatcher<TInput, TOutput> {
  private queue: { input: TInput; resolve: (value: TOutput) => void; reject: (err: Error) => void }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private fetchFn: (inputs: TInput[]) => Promise<TOutput[]>,
    private maxBatchSize = 50,
    private delayMs = 0
  ) {}

  add(input: TInput): Promise<TOutput> {
    return new Promise((resolve, reject) => {
      this.queue.push({ input, resolve, reject });

      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), this.delayMs);

      if (this.queue.length >= this.maxBatchSize) {
        this.flush();
      }
    });
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.maxBatchSize);

    try {
      const inputs = batch.map((b) => b.input);
      const results = await this.fetchFn(inputs);
      batch.forEach((b, i) => b.resolve(results[i]));
    } catch (err) {
      batch.forEach((b) => b.reject(err as Error));
    }
  }
}

// Usage: batch category fetches
const categoryBatcher = new RequestBatcher<string, Category>(
  async (ids) => {
    const res = await fetch(`/api/categories/batch?ids=${ids.join(',')}`);
    return res.json();
  },
  50,
  10 // collect for 10ms before flushing
);

// In component:
const category = await categoryBatcher.add('cat-1');
```

---

## 5. GraphQL Field Selection

### Request Only Needed Fields

```graphql
# BAD: Fetches everything
query {
  product(id: "123") {
    id name price category description images
    reviews { id text rating user { name avatar } }
    specifications { key value }
  }
}

# GOOD: Fetches only what the UI renders
query {
  product(id: "123") {
    id
    name
    price
  }
}
```

### Fragment Colocation

```typescript
// Define fragments next to the component that uses them
// components/ProductCard.tsx
export const PRODUCT_CARD_FRAGMENT = gql`
  fragment ProductCard on Product {
    id
    name
    price
    category
  }
`;

function ProductCard({ product }: { product: ProductCardFragment }) {
  return <div>{product.name} — ${product.price}</div>;
}

// Parent query imports the fragment
const GET_PRODUCTS = gql`
  ${PRODUCT_CARD_FRAGMENT}
  query GetProducts {
    products {
      ...ProductCard
    }
  }
`;
```

---

## 6. Sparse Fieldsets for REST

### Implementing ?fields=id,name,price

```typescript
function useSparseProducts<T extends keyof Product>(fields: T[]) {
  const fieldsParam = fields.join(',');

  return useQuery({
    queryKey: ['products', { fields: fieldsParam }],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/products?fields=${fieldsParam}`, { signal });
      return res.json() as Promise<Pick<Product, T>[]>;
    },
  });
}

// Usage: only fetches id, name, price from the server
function ProductList() {
  const { data } = useSparseProducts(['id', 'name', 'price']);
  return data?.map((p) => <div key={p.id}>{p.name} — ${p.price}</div>);
}
```

### Memoize Field-Projected Queries Separately

```typescript
// Two components requesting different fields create separate cache entries
function ProductName() {
  const { data } = useSparseProducts(['id', 'name']); // cached as "products:fields:id,name"
  // ...
}

function ProductPrice() {
  const { data } = useSparseProducts(['id', 'price']); // cached as "products:fields:id,price"
  // ...
}
```

---

## 7. Optimistic UI for Mutations

### Update UI Before Server Responds

```typescript
function useToggleProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (product: Product) => {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !product.isActive }),
      });
      return res.json();
    },

    onMutate: async (product) => {
      await queryClient.cancelQueries({ queryKey: ['products'] });

      const previous = queryClient.getQueriesData<ProductListResponse>({
        queryKey: ['products'],
      });

      // Optimistic update
      queryClient.setQueriesData<ProductListResponse>(
        { queryKey: ['products'] },
        (old) => ({
          ...old!,
          data: old!.data.map((p) =>
            p.id === product.id ? { ...p, isActive: !p.isActive } : p
          ),
        })
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      // Rollback
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
```

---

## 8. Request Deduplication

### How React Query Deduplicates

React Query deduplicates requests with the same query key that are in-flight simultaneously. If two components mount and both trigger `useQuery({ queryKey: ['products'] })`, only one network request is made.

### Manual Deduplication with a Map

```typescript
const inflight = new Map<string, Promise<unknown>>();

function dedupedFetch<T>(key: string, url: string): Promise<T> {
  if (inflight.has(key)) {
    return inflight.get(key)! as Promise<T>;
  }

  const promise = fetch(url)
    .then((res) => res.json())
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

// Usage: multiple calls with the same key share one request
const [a, b] = await Promise.all([
  dedupedFetch('products', '/api/products'),
  dedupedFetch('products', '/api/products'), // no second request
]);
```

---

## 9. Virtual Tables for Large Datasets

### When to Virtualize

If the server returns > 100 rows and the user can scroll through them, virtualize. Only render the visible rows plus a small buffer.

### Row Virtualization with react-window

```typescript
import { FixedSizeList } from 'react-window';

function VirtualProductTable({ products }: { products: Product[] }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={products.length}
      itemSize={48}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style} className="flex items-center border-b px-4">
          <span className="w-1/4">{products[index].name}</span>
          <span className="w-1/4">{products[index].category}</span>
          <span className="w-1/4">${products[index].price}</span>
          <span className="w-1/4">{products[index].stock}</span>
        </div>
      )}
    </FixedSizeList>
  );
}
```

### Variable Row Heights

```typescript
import { VariableSizeList } from 'react-window';

function VirtualTable({ items }: { items: Item[] }) {
  const listRef = useRef<VariableSizeList>(null);

  const getItemSize = (index: number) => {
    // Taller rows for items with long descriptions
    return items[index].description.length > 100 ? 80 : 48;
  };

  return (
    <VariableSizeList
      ref={listRef}
      height={600}
      itemCount={items.length}
      itemSize={getItemSize}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style} className="border-b px-4 py-2">
          <div className="font-medium">{items[index].name}</div>
          <div className="text-sm text-gray-500 truncate">{items[index].description}</div>
        </div>
      )}
    </VariableSizeList>
  );
}
```

---

## 10. Progressive Loading Patterns

### Skeleton Screens vs Spinners

| Pattern | UX Impact | Performance Impact |
|---------|-----------|-------------------|
| Spinner | Empty page → spinner → content (jarring) | No extra rendering work |
| Skeleton | Layout visible immediately → content fills in (smooth) | Slight extra rendering for placeholder shapes |
| Content placeholder | Approximate shape of final content (best) | Most rendering work upfront |

### Skeleton Screen Pattern

```typescript
function ProductListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 animate-pulse">
          <div className="h-12 w-12 bg-gray-200 rounded" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </div>
          <div className="h-4 bg-gray-200 rounded w-16" />
        </div>
      ))}
    </div>
  );
}

// Usage with React Query
function ProductList() {
  const { data, isLoading } = useQuery({ queryKey: ['products'], queryFn: fetchProducts });

  if (isLoading) return <ProductListSkeleton />;

  return data.map((p) => <ProductCard key={p.id} product={p} />);
}
```

### Streaming-First Design

```typescript
// Fetch critical data first, defer secondary data
function Dashboard() {
  // Critical: renders above the fold
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  });

  // Secondary: renders below the fold, can load later
  const { data: recentOrders } = useQuery({
    queryKey: ['orders', 'recent'],
    queryFn: fetchRecentOrders,
    enabled: !!stats, // only fetch after stats load
  });

  return (
    <div>
      <StatsBar stats={stats} /> {/* Always visible first */}
      <OrderTable orders={recentOrders} /> {/* Loads progressively */}
    </div>
  );
}
```

---

> **Next:** See [detect.md](./detect.md) if you haven't run detection first. Then proceed to the project files in `./project/` for runnable implementations.
