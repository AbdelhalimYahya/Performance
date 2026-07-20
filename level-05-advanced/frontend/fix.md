# How to Fix Advanced Frontend Performance Issues

> Production-ready solutions for bundle optimization, code splitting, tree shaking, and advanced performance patterns in Next.js 14 App Router.

---

## 1. Code Splitting Strategy

Three levels of code splitting, ordered by impact:

### Route-Level (Automatic in Next.js)

Next.js App Router splits routes automatically. Each `page.tsx` in `app/` becomes a separate chunk. No action needed — but verify it's working.

### Component-Level (dynamic())

```typescript
// app/dashboard/page.tsx
import { Suspense } from 'react';

// This component is NOT in the initial bundle
const HeavyChart = dynamic(() => import('@/components/HeavyChart'), {
  loading: () => <div className="h-96 bg-gray-100 animate-pulse" />,
  ssr: false,
});

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      {/* HeavyChart loads only when this route is visited */}
      <Suspense fallback={<div>Loading chart...</div>}>
        <HeavyChart />
      </Suspense>
    </div>
  );
}
```

### Library-Level (Lazy Import of Heavy Deps)

```typescript
// Only import moment.js when the user opens the date picker
export function DateRangePicker() {
  const [moment, setMoment] = useState<typeof import('moment') | null>(null);

  const handleOpen = async () => {
    if (!moment) {
      const mod = await import('moment');
      setMoment(() => mod.default);
    }
  };

  return <button onClick={handleOpen}>Pick Date</button>;
}
```

### Decision Framework

Split if: **more than 30KB gzipped AND not needed on initial paint.**

---

## 2. next/dynamic Mastery

### ssr: false — Client-Only Components

```typescript
// Components that use window/document must disable SSR
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
});
```

### Loading Skeleton

```typescript
const DataGrid = dynamic(() => import('@/components/DataGrid'), {
  loading: () => (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
      ))}
    </div>
  ),
});
```

### Preloading on Hover

```typescript
// Pre-warm the chunk when user hovers the trigger
const importChart = () => import('@/components/HeavyChart');

export function ChartTrigger() {
  return (
    <div
      onMouseEnter={() => importChart()} // preload on hover
      onClick={() => importChart()}      // load on click
    >
      <button>Show Chart</button>
    </div>
  );
}
```

---

## 3. Tree Shaking That Actually Works

### Why Tree Shaking Fails

1. **Side effects in package.json**: If a package declares side effects, bundler keeps everything.
2. **CommonJS modules**: `require()` cannot be tree-shaken. Only ESM (`import/export`) is tree-shakeable.
3. **Barrel files**: `index.ts` that re-exports everything forces bundler to include all exports.

### Fixes

```json
// Your package.json — tell bundler your code has no side effects
{
  "sideEffects": false
}
```

```typescript
// BAD: barrel file anti-pattern (forces all exports into bundle)
// components/index.ts
export { Button } from './Button';
export { Modal } from './Modal';
export { DataTable } from './DataTable';

// GOOD: direct import (bundler only includes what you use)
import { Button } from '@/components/Button';
```

```typescript
// BAD: lodash (CommonJS, not tree-shakeable)
import _ from 'lodash';
_.debounce(fn, 300);

// GOOD: lodash-es (ESM, tree-shakeable)
import { debounce } from 'lodash-es';
debounce(fn, 300);
```

### Verify with Bundle Analyzer

```bash
ANALYZE=true npm run build
# Before: check lodash size in treemap
# After: check lodash-es size in treemap (should be smaller)
```

---

## 4. Bundle Splitting with webpack/Turbopack

```javascript
// next.config.js
module.exports = {
  webpack: (config, { isServer }) => {
    config.optimization.splitChunks = {
      cacheGroups: {
        // Force large vendor packages into separate chunks
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 10,
        },
        // Shared code between routes → commons chunk
        commons: {
          name: 'commons',
          minChunks: 2, // used in 2+ routes
          chunks: 'all',
          priority: 5,
        },
      },
    };
    return config;
  },
};
```

### Named Chunks for Debugging

```typescript
// Dynamic import with webpackChunkName for readable chunk names
const AdminPanel = dynamic(() => import(/* webpackChunkName: "admin" */ '@/components/AdminPanel'));
const UserSettings = dynamic(() => import(/* webpackChunkName: "settings" */ '@/components/UserSettings'));
```

---

## 5. Replacing Heavy Libraries

### Decision Framework

Replace if: **library > 10KB gzipped AND can be replaced with a lighter alternative.**

| Heavy Library | Size (gzipped) | Replacement | Size (gzipped) | Savings |
|--------------|----------------|-------------|----------------|---------|
| moment.js | 72KB | date-fns | 15KB | 79% |
| lodash | 24KB | lodash-es | 10KB | 58% |
| lodash | 24KB | native JS | 0KB | 100% |
| axios | 14KB | fetch | 0KB | 100% |
| chart.js | 60KB | recharts | 30KB | 50% |

### Measuring Impact

```bash
# Before swap
ANALYZE=true npm run build
# Record size from treemap

# After swap
ANALYZE=true npm run build
# Record new size, calculate reduction
```

---

## 6. Image and Font Optimization Advanced

### next/image with Custom Loader

```typescript
// app/page.tsx
import Image from 'next/image';

export default function Page() {
  return (
    <Image
      src="/hero.jpg"
      alt="Hero"
      width={1200}
      height={600}
      placeholder="blur"
      blurDataURL="data:image/jpeg;base64,/9j/4AAQ..." // generated at build time
      sizes="(max-width: 768px) 100vw, 50vw"
    />
  );
}
```

### next/font for Zero Layout Shift

```typescript
// app/layout.tsx
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap', // prevents FOIT
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
```

---

## 7. WASM Integration Pattern

### Webpack Config

```javascript
// next.config.js
module.exports = {
  webpack: (config) => {
    config.experiments = {
      asyncWebAssembly: true,
    };
    return config;
  },
};
```

### TypeScript Wrapper with Fallback

```typescript
// lib/image-processor.ts
let wasmModule: WebAssembly.Module | null = null;

async function loadWasm(): Promise<WebAssembly.Module> {
  if (wasmModule) return wasmModule;

  try {
    const response = await fetch('/wasm/image-processing.wasm');
    wasmModule = await WebAssembly.compileStreaming(response);
    return wasmModule;
  } catch {
    throw new Error('WASM failed to load — falling back to JS');
  }
}

export async function processImage(data: Uint8Array): Promise<Uint8Array> {
  try {
    const module = await loadWasm();
    const instance = await WebAssembly.instantiate(module);
    // Call WASM function
    return new Uint8Array((instance.exports.process as CallableFunction)(data));
  } catch {
    // Graceful fallback to JavaScript
    return processImageJS(data);
  }
}

function processImageJS(data: Uint8Array): Uint8Array {
  // JS fallback implementation
  return data;
}
```

---

## 8. Preloading and Prefetching

### Via Next.js Metadata API

```typescript
// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  other: {
    // Preload critical fonts
    link: [
      {
        rel: 'preload',
        href: '/fonts/inter.woff2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      // Prefetch next-page resources
      {
        rel: 'prefetch',
        href: '/api/data',
      },
    ],
  },
};
```

### Manual Preload in Component

```typescript
// Preload hero image for better LCP
export function Hero() {
  return (
    <section>
      <link rel="preload" href="/hero.jpg" as="image" />
      <Image src="/hero.jpg" alt="Hero" width={1200} height={600} priority />
    </section>
  );
}
```

---

## 9. Script Loading Optimization

### next/script Strategies

```typescript
// app/layout.tsx
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}

        {/* Analytics: load after page is interactive */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"
          strategy="lazyOnload"
        />

        {/* Chat widget: load after interactive, not blocking */}
        <Script src="https://js.intercomcdn.com/widget.js" strategy="afterInteractive" />

        {/* Critical A/B test: must load before interactive */}
        <Script src="/ab-test.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
```

### Partytown for Off-Main-Thread Scripts

```bash
npm install @builder.io/partytown
```

```typescript
// next.config.js
module.exports = {
  experimental: {
    Partytown: true,
  },
};
```

```typescript
// Partytown moves third-party scripts to a Web Worker
// Limitation: cannot access DOM directly, needs proxy configuration
<Script
  src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"
  type="text/partytown"
/>
```

---

## 10. Reducing JavaScript Parse Time

### Script Streaming

Browsers parse scripts as they download. Smaller scripts = faster parse. Use code splitting to reduce per-script size.

### Brotli Compression

Brotli decompresses ~20% faster than gzip, and compresses ~15% smaller.

```bash
# Install Brotli
npm install next-brotli

# next.config.js
const withBrotli = require('next-brotli');
module.exports = withBrotli({
  // your config
});
```

Or configure via `next.config.js` headers:

```javascript
module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Encoding', value: 'br' },
        ],
      },
    ];
  },
};
```

---

## 11. CSS Optimization

### PurgeCSS for Tailwind

```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  // PurgeCSS automatically removes unused Tailwind classes
};
```

### Critical CSS Extraction

```typescript
// Inline above-the-fold CSS for faster FCP
// next.config.js
module.exports = {
  experimental: {
    optimizeCss: true, // uses Critters to inline critical CSS
  },
};
```

### CSS Modules vs Global CSS

```typescript
// CSS Modules: scoped, only loaded when component is used
// components/Button.module.css → only loaded if Button is in bundle
import styles from './Button.module.css';

// Global CSS: loaded always, cannot be split
// styles/globals.css → loaded on every page
```

---

## 12. Before/After Measurement Template

```markdown
## Bundle Optimization Log

| Chunk Name | Before (KB gz) | After (KB gz) | Reduction | Technique | Analyzer Link |
|-----------|----------------|---------------|-----------|-----------|---------------|
| main.js | 250 | 180 | 28% | Code split dashboard | [link](#) |
| vendor.js | 120 | 45 | 62.5% | Replaced moment with date-fns | [link](#) |
| dashboard.js | 0 (not split) | 35 | new chunk | dynamic() import | [link](#) |
| admin.js | 0 (not split) | 28 | new chunk | dynamic() import | [link](#) |
| Total | 370 | 288 | 22% | — | — |

### Notes
- moment.js → date-fns: saved 77KB gzipped
- lodash → lodash-es: saved 14KB gzipped
- Code split dashboard: removed 70KB from main bundle
```

---

> **Next:** See [detect.md](./detect.md) for detection, then the project files in `./project/` for runnable implementations.
