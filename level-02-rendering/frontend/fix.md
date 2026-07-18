# How to Fix Rendering Performance Issues

> A comprehensive fix guide for rendering performance in React and Next.js. Every fix here is production-ready with real TypeScript code.

---

## 1. React.memo — When to Use It and When Not To

`React.memo` prevents a component from re-rendering if its props haven't changed (shallow comparison). It is not free — it adds comparison overhead on every render.

### When to Use It

```typescript
// GOOD: Expensive component that receives stable props
const ExpensiveList = React.memo(function ExpensiveList({ items }: { items: Item[] }) {
  // Expensive rendering logic
  return items.map((item) => <ComplexItem key={item.id} item={item} />);
});

// GOOD: Component that re-renders often but props rarely change
const DisplayValue = React.memo(function DisplayValue({ value }: { value: number }) {
  return <span>{value.toLocaleString()}</span>;
});
```

### When NOT to Use It

```typescript
// BAD: Component with frequently changing props — memo comparison wastes time
const Timer = React.memo(function Timer({ time }: { time: number }) {
  return <span>{time}</span>;
});
// time changes every second, so memo comparison runs every second for nothing

// BAD: Component that always receives new object references
const Card = React.memo(function Card({ data }: { data: Data }) {
  return <div>{data.name}</div>;
});
// If parent does: <Card data={{ name: 'foo' }} /> — new object every render
// Memo comparison always fails, adding overhead with no benefit
```

### How to Measure if It Helped

```typescript
// Wrap with React.Profiler to measure
<Profiler id="ExpensiveList" onRender={(id, phase, duration) => {
  if (phase === 'update') {
    console.log(`${id} re-rendered in ${duration.toFixed(1)}ms`);
  }
}}>
  <ExpensiveList items={items} />
</Profiler>
```

Compare render counts and durations with and without `React.memo`. If the component renders fewer times but takes longer per render, memo is hurting.

---

## 2. useMemo and useCallback — The Cost of Memoization

Memoization has overhead: it stores values in memory and runs comparison logic. The break-even point is when the cost of re-computation exceeds the cost of comparison.

### What to Actually Memoize

```typescript
// GOOD: Expensive computation that depends on stable inputs
const sortedItems = useMemo(() => {
  return items.sort((a, b) => a.price - b.price);
}, [items]);

// GOOD: Function passed to a memoized child
const handleClick = useCallback(() => {
  console.log('clicked', itemId);
}, [itemId]);

// BAD: Simple values — comparison costs more than recreation
const fullName = useMemo(() => `${first} ${last}`, [first, last]);
// Just do: const fullName = `${first} ${last}`; — it's faster

// BAD: Functions that always create new references anyway
const style = useMemo(() => ({ color: 'red' }), []);
// Just do: const style = { color: 'red' }; — or define outside component
```

### Common Mistakes

```typescript
// MISTAKE: Forgetting dependencies
const filtered = useMemo(() => items.filter((i) => i.category === category), []);
// Missing `items` and `category` — stale closure

// MISTAKE: Memoizing everything blindly
// Every useMemo call has a cost. Only memoize when you measure a problem.

// MISTAKE: Creating objects inside useMemo that still create new references
const config = useMemo(() => ({ endpoint: '/api', timeout: 5000 }), []);
// This is fine — primitive values, stable reference
```

---

## 3. Context Performance

Context triggers re-renders in ALL consumers when the value changes, even if a consumer only uses a subset of the value.

### Why Context Is Slow

```typescript
const AppContext = createContext({ user: null, theme: 'dark', notifications: [] });

// Every consumer re-renders when ANY field changes
function UserComponent() {
  const { user } = useContext(AppContext); // Re-renders when theme changes too
  return <div>{user.name}</div>;
}
```

### Split Contexts

```typescript
// Split into separate contexts
const UserContext = createContext<User | null>(null);
const ThemeContext = createContext('dark');
const NotificationsContext = createContext<Notification[]>([]);

// Now changing theme only re-renders ThemeContext consumers
function UserComponent() {
  const user = useContext(UserContext);
  return <div>{user.name}</div>;
}
```

### Use Zustand/Jotai for Performance-Critical State

```typescript
// Zustand: selective subscriptions — only re-renders when selected state changes
import { create } from 'zustand';

interface Store {
  user: User | null;
  theme: string;
  setUser: (user: User) => void;
  setTheme: (theme: string) => void;
}

const useStore = create<Store>((set) => ({
  user: null,
  theme: 'dark',
  setUser: (user) => set({ user }),
  setTheme: (theme) => set({ theme }),
}));

// Only re-renders when user changes, not when theme changes
function UserComponent() {
  const user = useStore((s) => s.user);
  return <div>{user?.name}</div>;
}
```

---

## 4. Server Components in Next.js 14

Server Components render on the server and send HTML to the client. They reduce client JavaScript bundle size and improve initial load performance.

### How to Convert

```typescript
// Before: Client Component
'use client';
import { useState, useEffect } from 'react';

export function ProductList() {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    fetch('/api/products').then((r) => r.json()).then(setProducts);
  }, []);
  return products.map((p) => <div key={p.id}>{p.name}</div>);
}

// After: Server Component (fetch runs on the server, no client JS needed)
async function ProductList() {
  const res = await fetch('https://api.example.com/products');
  const products = await res.json();
  return products.map((p) => <div key={p.id}>{p.name}</div>);
}
```

### What You Lose

- `useState`, `useEffect`, event handlers, browser APIs
- Interactive UI (click handlers, form inputs)
- Client-side navigation hooks (`useRouter`, `usePathname`)

### What You Gain

- Zero client JavaScript for this component
- Direct database access (no API layer needed)
- Async components (`async function` in the component itself)
- Automatic code splitting (only client components send JS)

### Composition Pattern

```typescript
// Server Component wraps Client Components
async function ProductPage({ params }: { params: { id: string } }) {
  const product = await fetchProduct(params.id);

  return (
    <div>
      <h1>{product.name}</h1>  {/* Server-rendered, no JS sent */}
      <ProductInteractivity product={product} />  {/* Client component for interactivity */}
    </div>
  );
}
```

---

## 5. Streaming with Suspense

Streaming allows the server to send HTML progressively. Instead of waiting for all data, the server sends the shell immediately, then streams additional content as it becomes available.

### Basic Streaming Pattern

```typescript
// app/products/page.tsx
import { Suspense } from 'react';

export default async function ProductsPage() {
  return (
    <div>
      <h1>Products</h1>
      {/* This renders immediately */}
      <ProductFilters />

      {/* This streams in when data is ready */}
      <Suspense fallback={<ProductSkeleton />}>
        <ProductList />
      </Suspense>

      {/* This streams in independently */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <Recommendations />
      </Suspense>
    </div>
  );
}
```

### Impact on TTFB vs LCP

- **TTFB improves:** The server sends the initial HTML shell immediately
- **LCP may not change:** The largest contentful element might be inside a Suspense boundary
- **FCP improves:** The user sees content sooner (skeleton → content)

### Nested Suspense Boundaries

```typescript
<Suspense fallback={<PageSkeleton />}>
  <PageContent>
    <Suspense fallback={<SectionSkeleton />}>
      <SlowSection />
    </Suspense>
    <Suspense fallback={<SectionSkeleton />}>
      <AnotherSection />
    </Suspense>
  </PageContent>
</Suspense>
```

Each boundary streams independently. The page shell appears first, then sections appear one by one as their data loads.

---

## 6. Avoiding Hydration Mismatches

### suppressHydrationWarning

```typescript
// Use on elements where the server and client intentionally differ
<time suppressHydrationWarning dateTime={date.toISOString()}>
  {date.toLocaleDateString()}
</time>
```

Use sparingly — it only suppresses the warning for that specific element, not its children.

### Fixing Dynamic Content

```typescript
// BAD: Server renders "January 15, 2024", client renders "January 15, 2025"
<p>{new Date().toLocaleDateString()}</p>

// GOOD: Render a placeholder on server, actual date on client
'use client';
import { useState, useEffect } from 'react';

function ClientDate() {
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    setDate(new Date().toLocaleDateString());
  }, []);

  return <time>{date ?? '...'}</time>;
}
```

### Date Formatting Pitfalls

```typescript
// BAD: Server and client timezones differ
<p>{new Date('2024-01-15T12:00:00Z').toLocaleDateString()}</p>
// Server: "1/15/2024" (UTC)
// Client: "1/15/2024" (EST) — or "1/14/2024" if timezone offset crosses midnight

// GOOD: Use a consistent format
<p>{format(new Date('2024-01-15T12:00:00Z'), 'yyyy-MM-dd')}</p>
// Both server and client: "2024-01-15"
```

---

## 7. Image and Font Rendering Fixes

### next/image Priority

```typescript
import Image from 'next/image';

// LCP image: use priority to preload
<Image
  src="/hero.jpg"
  width={1200}
  height={675}
  alt="Hero"
  priority  // Adds <link rel="preload"> — loads before other resources
/>

// Below-fold images: use lazy loading (default)
<Image
  src="/product.jpg"
  width={400}
  height={300}
  alt="Product"
  loading="lazy"
/>
```

### Placeholder Blur

```typescript
// Show a blurred preview while the image loads
<Image
  src="/photo.jpg"
  width={800}
  height={600}
  alt="Photo"
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,/9j/4AAQ..." // Base64 tiny image
/>
```

### Font Display Swap

```typescript
// app/layout.tsx
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap', // Shows fallback font immediately, swaps when loaded
  preload: true,    // Preloads the font file
});
```

---

## 8. CSS-in-JS Performance

Runtime CSS-in-JS (styled-components, emotion) hurts SSR performance because:
- Styles are generated at runtime, not build time
- The server must execute JavaScript to generate CSS
- The client must re-execute the same logic during hydration
- The stylesheet grows over time as new components mount

### Alternatives

**CSS Modules:** Zero runtime cost, scoped by default, works with SSR natively.

```typescript
// styles.module.css
.container { display: flex; }
.title { font-size: 1.5rem; }

// Component.tsx
import styles from './styles.module.css';
export function Component() {
  return <div className={styles.container}>{/* ... */}</div>;
}
```

**Tailwind CSS:** Utility-first, no runtime, CSS purged at build time.

```typescript
// Just use class names — no runtime overhead
export function Component() {
  return <div className="flex text-lg font-bold">{/* ... */}</div>;
}
```

### If You Must Use CSS-in-JS

```typescript
// styled-components with SSR
// 1. Use static extraction (babel plugin)
// 2. Use StyleSheetManager to extract at build time
// 3. Consider Linaria (zero-runtime CSS-in-JS)
```

---

## 9. Virtual Lists for Long Pages

When rendering 10,000+ items, rendering all DOM nodes destroys performance. Virtual lists only render the visible items plus a small buffer.

### Building a Simple Virtualizer

```typescript
'use client';
import { useState, useRef, useCallback, useMemo } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
}

function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 3,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { startIndex, endIndex, totalHeight, offsetY } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(items.length - 1, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan);
    return {
      startIndex: start,
      endIndex: end,
      totalHeight: items.length * itemHeight,
      offsetY: start * itemHeight,
    };
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan]);

  const visibleItems = useMemo(() => {
    const result = [];
    for (let i = startIndex; i <= endIndex; i++) {
      result.push(
        <div key={i} style={{ height: itemHeight }}>
          {renderItem(items[i], i)}
        </div>
      );
    }
    return result;
  }, [items, startIndex, endIndex, itemHeight, renderItem]);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ height: containerHeight, overflow: 'auto' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems}
        </div>
      </div>
    </div>
  );
}
```

### Usage

```typescript
function ProductList() {
  const products = Array.from({ length: 100_000 }, (_, i) => ({
    id: i,
    name: `Product ${i}`,
  }));

  return (
    <VirtualList
      items={products}
      itemHeight={48}
      containerHeight={600}
      renderItem={(product) => (
        <div className="flex items-center h-12 px-4 border-b">
          {product.name}
        </div>
      )}
    />
  );
}
```

---

## 10. Transition API and Deferred Updates

### useTransition

Use `useTransition` to mark state updates as non-urgent. The UI stays responsive during the update.

```typescript
'use client';
import { useState, useTransition } from 'react';

function SearchFilter() {
  const [query, setQuery] = useState('');
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [isPending, startTransition] = useTransition();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value); // Urgent: update input immediately

    startTransition(() => {
      // Non-urgent: filter list in background
      setFilteredItems(items.filter((item) =>
        item.name.toLowerCase().includes(value.toLowerCase())
      ));
    });
  };

  return (
    <div>
      <input value={query} onChange={handleChange} />
      {isPending && <Spinner />}
      <ItemList items={filteredItems} />
    </div>
  );
}
```

### useDeferredValue

Use `useDeferredValue` when a derived value is expensive to compute and can lag behind the source.

```typescript
'use client';
import { useDeferredValue, useMemo } from 'react';

function SearchResults({ query }: { query: string }) {
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(() => {
    return items.filter((item) =>
      item.name.toLowerCase().includes(deferredQuery.toLowerCase())
    );
  }, [deferredQuery]);

  return (
    <div style={{ opacity: query !== deferredQuery ? 0.7 : 1 }}>
      {results.map((item) => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
}
```

### When to Use Which

- **useTransition:** When you control the state update (button click, form input)
- **useDeferredValue:** When the expensive computation is derived from a prop or existing state
- **useTransition** gives you `isPending` to show loading states
- **useDeferredValue** is simpler when you just need the value to lag

---

> **Next:** See [detect.md](./detect.md) if you haven't run detection first. Then proceed to the project files in `./project/` for runnable implementations.
