# How to Detect Bundle & Advanced Frontend Performance Issues

> Senior engineer's guide to diagnosing bundle bloat, code splitting failures, render bottlenecks, and memory issues in React/Next.js applications.

---

## 1. Bundle Analysis Fundamentals

A JavaScript bundle is a concatenation of modules the browser must download, parse, and execute. Each phase costs differently:

- **Download time**: Network latency + bandwidth. Measured via `resource.duration` in PerformanceObserver.
- **Parse time**: V8 parsing JS into AST. CPU-bound, blocks main thread. Measured via `PerformanceObserver('script')` with `duration`.
- **Execution time**: Running the JS code. Also CPU-bound. Measured via `PerformanceObserver('longtask')`.

### Measuring Each Phase Separately

```typescript
// PerformanceObserver for resource timing (download)
const resourceObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.initiatorType === 'script') {
      console.log(`Script: ${entry.name}`);
      console.log(`  Download: ${entry.duration.toFixed(0)}ms`);
      console.log(`  TTFB: ${entry.responseStart.toFixed(0)}ms`);
      console.log(`  Transfer: ${entry.transferSize} bytes`);
    }
  }
});
resourceObserver.observe({ type: 'resource', buffered: true });

// PerformanceObserver for long tasks (>50ms = jank)
const longTaskObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.warn(`Long task: ${entry.duration.toFixed(0)}ms at ${entry.startTime.toFixed(0)}ms`);
  }
});
longTaskObserver.observe({ type: 'longtask', buffered: true });
```

### User Timing API

```typescript
// Mark start/end of operations
performance.mark('bundle-parse-start');
// ... parse phase ...
performance.mark('bundle-parse-end');
performance.measure('bundle-parse', 'bundle-parse-start', 'bundle-parse-end');

const measures = performance.getEntriesByName('bundle-parse');
console.log(`Parse time: ${measures[0].duration.toFixed(0)}ms`);
```

### DevTools Coverage Tab

1. Open Chrome DevTools → Coverage tab
2. Click record, reload page
3. Shows: total bytes, used bytes, unused bytes per script
4. Red bars = dead code that's downloaded and parsed but never executed

---

## 2. @next/bundle-analyzer Deep Dive

### Setup

```bash
npm install @next/bundle-analyzer
```

```javascript
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
module.exports = withBundleAnalyzer({});
```

### Generate Report

```bash
ANALYZE=true npm run build
```

Opens a browser tab with an interactive treemap. Each rectangle = a module. Size = bundle contribution.

### Reading the Treemap

- **stat size**: Raw source size before minification
- **parsed size**: After minification (what V8 parses)
- **gzip size**: After compression (what travels over network)

Look for:
- Largest rectangles first (biggest impact)
- Duplicate packages (lodash appearing twice with different paths: `lodash/get` and `lodash.merge`)
- Packages that should be externalized (moment.js, date-fns)

### Spotting Duplicates

If you see `node_modules/lodash` AND `node_modules/lodash-es`, you have duplicate lodash. Fix with `package.json` aliases:

```json
{
  "overrides": {
    "lodash": "npm:lodash-es"
  }
}
```

---

## 3. source-map-explorer

### Run It

```bash
# Generate source maps
NEXTJS_SOURCE_MAPS=true npm run build

# Analyze
npx source-map-explorer .next/static/chunks/*.js
```

### Reading the Output

Same treemap visualization as bundle-analyzer but with more accurate per-byte attribution. The source-map-explorer traces back to original source files, not bundled modules.

### Compare Before/After

```bash
# Before optimization
npx source-map-explorer dist-before/**/*.js --json > before.json

# After optimization
npx source-map-explorer dist-after/**/*.js --json > after.json

# Diff
npx source-map-explorer dist-after/**/*.js --replace-before before.json
```

### Correct Source Maps

Ensure `next.config.js` has:

```javascript
module.exports = {
  productionBrowserSourceMaps: true, // generates .map files
};
```

Without this, source-map-explorer cannot attribute bytes to source files.

---

## 4. Detecting Code Splitting Failures

### How to Verify Chunks Are Created

After `next build`, check `.next/static/chunks/`:

```bash
ls -la .next/static/chunks/
# Should see multiple chunk files: main-abc123.js, page-def456.js, etc.
```

If you only see one or two large chunks, code splitting is not working.

### Network Tab Waterfall

1. Open DevTools → Network tab
2. Filter by JS
3. Navigate to different pages
4. Lazy-loaded chunks appear as new requests AFTER initial load

If all chunks load immediately, they're not lazy.

### Detecting Static Bundle of Dynamic Imports

```typescript
// BAD: this imports the module at build time (no code splitting)
const HeavyComponent = dynamic(() => import('./HeavyComponent'));

// GOOD: verify chunk is separate
// In Network tab, HeavyComponent should load only when route is visited
```

Check for dynamic imports that are tree-shaken away:

```bash
# Search for dynamic imports in your codebase
grep -r "dynamic(" src/ --include="*.tsx" --include="*.ts"
```

If a dynamic import exists but the chunk doesn't appear in Network tab, it's being bundled statically.

---

## 5. Tree Shaking Verification

### Import Style Matters

```typescript
// Tree-shakeable: named import
import { specificFunction } from 'lodash-es';
// Only specificFunction is bundled

// NOT tree-shakeable: default import
import _ from 'lodash-es';
// Entire lodash-es is bundled
```

### Coverage Tab for Dead Code

1. Open Coverage tab
2. Reload page
3. Look for scripts with large red (unused) sections
4. Click a script to see line-by-line coverage
5. Red lines = dead code still in bundle

### rollup-plugin-visualizer

```bash
npm install rollup-plugin-visualizer -D
```

```javascript
// webpack.config.js or next.config.js
const { visualizer } = require('rollup-plugin-visualizer');

module.exports = {
  plugins: [
    visualizer({
      open: true,
      filename: 'bundle-stats.html',
      gzipSize: true,
    }),
  ],
};
```

Shows which exports from each module are actually used vs dead code.

---

## 6. Detecting Unused Dependencies

### depcheck

```bash
npx depcheck
```

Output:

```
Unused dependencies
* moment
* lodash

Unused devDependencies
* @types/jest

Missing dependencies
* react-is
```

### Dev Dependencies Shipped to Production

```bash
# Check what's in your production bundle
npx depcheck --json | jq '.dependencies'
```

If you see `@types/*`, `eslint`, `prettier`, or `jest` in production bundle, your bundler is including devDependencies.

Fix: ensure `package.json` has `"sideEffects": false` and your bundler config excludes devDependencies.

### Partially Used Packages

```bash
# Check bundle for specific packages
npx source-map-explorer dist/**/*.js | grep "moment"
```

If moment.js is in the bundle but you only use `moment().format()`, switch to `date-fns` or `dayjs` (tree-shakeable).

---

## 7. Third-party Script Impact

### Lighthouse "Third-party usage" Audit

Run Lighthouse → look for "Third-party usage" section. Shows:
- Total blocking time from third-party scripts
- Number of third-party scripts
- Which scripts block the main thread

### Resource Timing API

```typescript
const thirdPartyObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.name.includes('google-analytics') ||
        entry.name.includes('googletagmanager') ||
        entry.name.includes(' Intercom ') ||
        entry.name.includes('crisp.chat')) {
      console.log(`Third-party: ${entry.name}`);
      console.log(`  Duration: ${entry.duration.toFixed(0)}ms`);
      console.log(`  Transfer: ${entry.transferSize} bytes`);
    }
  }
});
thirdPartyObserver.observe({ type: 'resource', buffered: true });
```

### Isolating Cost

1. Open DevTools → Network tab
2. Block specific third-party domains (right-click → Block request URL)
3. Reload and compare Lighthouse scores
4. This shows the isolated cost of each third-party script

---

## 8. WASM Opportunity Detection

### Profiling CPU-bound Functions

1. Open DevTools → Performance tab
2. Record a profile while performing the operation
3. Look at Bottom-Up tab → sort by "Self time"
4. Functions with >16ms self-time are WASM candidates

### Identifying WASM Candidates

Look for:
- Pure computation (no DOM access)
- Loops with >1000 iterations
- Mathematical operations (matrix math, encryption, compression)
- Image/video processing

```typescript
// BAD for WASM: DOM interaction
function processElement(el: HTMLElement) {
  el.style.color = 'red'; // DOM = stays in JS
}

// GOOD for WASM: pure computation
function heavyComputation(data: Float64Array): Float64Array {
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.sqrt(data[i]) * Math.sin(data[i]);
  }
  return data;
}
```

---

## 9. Memory Leak Detection in SPAs

### Heap Snapshots (Take 3, Compare)

1. DevTools → Memory tab → Heap Snapshot
2. Take snapshot #1 (initial state)
3. Navigate through the app (do actions that might leak)
4. Take snapshot #2
5. Navigate back/forth 10 times
6. Take snapshot #3

In snapshot #3, filter by "Detached" to find DOM nodes that should have been garbage collected.

### Allocation Timeline

1. Memory tab → Allocation timeline
2. Start recording
3. Perform actions in the app
4. Stop recording
5. Look for growing allocations that never get garbage collected

### Reproducing Leaks

```typescript
// Navigate back and forth 10 times, then take snapshot
// If Detached DOM nodes grow, you have a leak
for (let i = 0; i < 10; i++) {
  window.history.pushState({}, '', `/page-${i}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
  await new Promise((r) => setTimeout(r, 500));
}
// Take heap snapshot here
```

### Common Leak Patterns

- Event listeners not removed on unmount
- setTimeout/setInterval not cleared
- Closures holding references to large objects
- Third-party libraries that don't clean up

---

## 10. Detecting Render-blocking Third Parties

### Coverage Tab + Blocking Time

1. Coverage tab: shows how much third-party JS is downloaded
2. Lighthouse "Blocking time" audit: shows which scripts block rendering
3. DevTools Network tab: sort by "Blocking" column

### Request Blocking Chain

1. Network tab → click a script → Timing tab
2. Shows "Blocking" period (colored red)
3. Chain: script A blocks script B blocks script C

### Finding Longest Chain

```bash
# Lighthouse CLI with specific audit
npx lighthouse https://example.com --only-categories=performance --output=json

# Check "render-blocking-resources" audit
cat lighthouse-report.json | jq '.audits["render-blocking-resources"]'
```

---

## 11. Quick Diagnostic Checklist

| # | Issue | Detection Method | Tool | Threshold | Action |
|---|-------|-----------------|------|-----------|--------|
| 1 | Bundle > 200KB gzipped | Bundle analyzer | @next/bundle-analyzer | > 200KB | Code split, remove unused deps |
| 2 | Parse time > 500ms | Performance tab | Chrome DevTools | > 500ms | Reduce bundle size |
| 3 | Long tasks > 50ms | Long task observer | PerformanceObserver | > 50ms/5s | Break up computation |
| 4 | Unused CSS > 30% | Coverage tab | Chrome DevTools | > 30% | Remove unused CSS |
| 5 | Unused JS > 30% | Coverage tab | Chrome DevTools | > 30% | Tree shake, code split |
| 6 | Duplicate packages | Bundle analyzer | @next/bundle-analyzer | Any duplicate | Dedupe with overrides |
| 7 | No code splitting | Network tab waterfall | Chrome DevTools | Single chunk | Add dynamic imports |
| 8 | Dynamic import bundled statically | Network tab | Chrome DevTools | No lazy chunk | Fix import syntax |
| 9 | Dead code in bundle | Coverage tab | Chrome DevTools | Red lines | Remove or tree-shake |
| 10 | Unused dependencies | depcheck | CLI | Any listed | Remove from package.json |
| 11 | Dev deps in prod bundle | source-map-explorer | CLI | Any dev deps | Fix bundler config |
| 12 | Third-party blocking > 200ms | Lighthouse | Lighthouse | > 200ms | Defer or remove |
| 13 | GTM blocking > 500ms | Resource Timing | PerformanceObserver | > 500ms | Async/defer load |
| 14 | Memory leak (growing heap) | Heap snapshots | Chrome DevTools | Growth over time | Find and fix leak |
| 15 | Detached DOM nodes | Heap snapshot filter | Chrome DevTools | Any detached | Remove event listeners |
| 16 | Event listener leak | Allocation timeline | Chrome DevTools | Growing | Clean up on unmount |
| 17 | Timer leak | Allocation timeline | Chrome DevTools | Growing | Clear on unmount |
| 18 | Render-blocking script | Blocking time | Lighthouse | > 0ms | Async/defer |
| 19 | CSS blocking > 100ms | Render-blocking | Lighthouse | > 100ms | Inline critical CSS |
| 20 | Image > 200KB | Lighthouse | Lighthouse | > 200KB | Compress, WebP, lazy load |
| 21 | No lazy loading | Lighthouse | Lighthouse | Missing audit | Add loading="lazy" |
| 22 | Layout shift > 0.1 | CLS score | Lighthouse | > 0.1 | Set explicit dimensions |
| 23 | FCP > 1.8s | FCP metric | Lighthouse | > 1.8s | Reduce render-blocking |
| 24 | LCP > 2.5s | LCP metric | Lighthouse | > 2.5s | Optimize largest element |
| 25 | INP > 200ms | INP metric | Lighthouse | > 200ms | Reduce event handler time |
| 26 | TTFB > 800ms | TTFB metric | Lighthouse | > 800ms | Edge caching, CDN |
| 27 | Transfer > 1MB | Network tab | Chrome DevTools | > 1MB | Compress, reduce assets |
| 28 | Large component tree | React DevTools Profiler | React DevTools | Deep nesting | Memoize, split |

---

> **Next:** After detection, see [fix.md](./fix.md) for solutions, then the project files in `./project/` for runnable implementations.
