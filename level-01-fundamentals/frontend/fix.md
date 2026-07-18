# How to Fix Frontend Performance Issues (Fundamentals)

> The second half of the detect guide — now we act on what we found. Every fix here is production-ready, not a demo.

---

## 1. Fix Strategy

Performance work without a strategy is random guessing. Follow this exact order:

1. **Measure** — Capture current state. Lighthouse score, Core Web Vitals, bundle size. Screenshot it. You need a baseline to compare against.
2. **Profile** — Open DevTools Performance tab. Record a session. Find the actual bottleneck — don't assume.
3. **Hypothesize** — Based on the profile, form a hypothesis: "If I lazy-load this image, LCP will drop by 400ms."
4. **Fix one thing** — Change only the one variable you hypothesized about. One fix at a time.
5. **Re-measure** — Run the same measurement again. Did it improve? By how much? Was it worth the complexity?

Repeat for each issue. Never fix multiple things at once — you won't know which fix helped.

---

## 2. Setting Up web-vitals Library

```bash
npm install web-vitals
```

```typescript
import { onCLS, onFCP, onLCP, onTTFB, onINP } from 'web-vitals';

interface MetricReport {
  id: string;
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  navigationType: string;
}

function sendToAnalytics(metric: MetricReport): void {
  const payload = JSON.stringify({
    ...metric,
    page: window.location.pathname,
    timestamp: Date.now(),
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/vitals', payload);
  } else {
    fetch('/api/vitals', { method: 'POST', body: payload, keepalive: true });
  }
}

function logMetric(metric: MetricReport): void {
  const colors: Record<string, string> = {
    good: '#0cce6b',
    'needs-improvement': '#ffa400',
    poor: '#ff4e42',
  };
  console.log(
    `%c${metric.name}: ${metric.value.toFixed(2)}ms (${metric.rating})`,
    `color: ${colors[metric.rating]}; font-weight: bold;`
  );
}

function reportWebVitals(): void {
  const report = (metric: MetricReport): void => {
    logMetric(metric);
    sendToAnalytics(metric);
  };

  onCLS(report);
  onFCP(report);
  onLCP(report);
  onTTFB(report);
  onINP(report);
}

reportWebVitals();
```

The `rating` field is automatically computed by the library based on the thresholds defined in the Core Web Vitals specification. You don't need to write threshold logic yourself.

---

## 3. PerformanceObserver API

The `PerformanceObserver` API lets you watch for performance entries as they happen, without polling.

```typescript
function observePaintEntries(): void {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      console.log(`Paint: ${entry.name} at ${entry.startTime.toFixed(0)}ms`);
    }
  });
  observer.observe({ type: 'paint', buffered: true });
}

function observeLongTasks(): void {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      console.warn(
        `Long task detected: ${entry.duration.toFixed(1)}ms`,
        entry.startTime.toFixed(0),
        entry
      );
    }
  });
  observer.observe({ type: 'longtask', buffered: true });
}

function observeLayoutShifts(): void {
  let clsValue = 0;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!(entry as any).hadRecentInput) {
        clsValue += (entry as any).value;
        console.log(`Layout shift: ${(entry as any).value.toFixed(4)}`, entry);
      }
    }
  });
  observer.observe({ type: 'layout-shift', buffered: true });
}

function observeLCP(): void {
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    console.log(`LCP element: ${lastEntry.startTime.toFixed(0)}ms`, lastEntry);
  });
  observer.observe({ type: 'largest-contentful-paint', buffered: true });
}

observePaintEntries();
observeLongTasks();
observeLayoutShifts();
observeLCP();
```

**Key difference from `web-vitals`:** `PerformanceObserver` gives you raw entries. `web-vitals` gives you processed, rated, deduplicated metrics. Use `PerformanceObserver` for custom analysis, `web-vitals` for standard reporting.

---

## 4. React Profiler API

The React Profiler API lets you measure render times per component. Wrap components with `<Profiler>` and provide an `onRender` callback.

```typescript
import { Profiler, ProfilerOnRenderCallback } from 'react';

interface RenderInfo {
  id: string;
  phase: 'mount' | 'update';
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
}

const renderLog: RenderInfo[] = [];

const onRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) => {
  const info: RenderInfo = {
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  };
  renderLog.push(info);

  if (actualDuration > 16) {
    console.warn(
      `Slow render: ${id} took ${actualDuration.toFixed(1)}ms (${phase})`
    );
  }

  if (actualDuration > 100) {
    console.error(
      `Critical: ${id} took ${actualDuration.toFixed(1)}ms — investigate immediately`
    );
  }
};

function getPerformanceBudget(): (info: RenderInfo) => boolean {
  const BUDGET_MS = 16;
  return (info) => info.actualDuration <= BUDGET_MS;
}

function App(): JSX.Element {
  return (
    <Profiler id="Dashboard" onRender={onRender}>
      <Dashboard />
    </Profiler>
  );
}
```

In development mode, the Profiler adds significant overhead. Only enable it in production builds when actively debugging performance, or gate it behind a feature flag.

---

## 5. Reducing Long Tasks

A long task is any JavaScript task exceeding 50ms. Long tasks block the main thread, prevent user interactions, and kill INP scores.

### Time Slicing with the Scheduler API

```typescript
async function processLargeDataset(items: unknown[]): Promise<void> {
  const CHUNK_SIZE = 100;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    processChunk(chunk);

    await new Promise((resolve) => {
      if ('scheduler' in globalThis && 'postTask' in (globalThis as any).scheduler) {
        (globalThis as any).scheduler.postTask(resolve, { priority: 'user-visible' });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }
}

function processChunk(chunk: unknown[]): void {
  for (const item of chunk) {
    // Do work here
  }
}
```

### requestIdleCallback Pattern

```typescript
function scheduleIdleWork(callback: () => void): void {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout: 1000 });
  } else {
    setTimeout(callback, 1);
  }
}

function deferHeavyComputation(fn: () => void): void {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(
      (deadline) => {
        while (deadline.timeRemaining() > 0 && !deadline.didTimeout) {
          fn();
          break; // Process one unit of work, yield, and let the browser handle interactions
        }
      },
      { timeout: 2000 }
    );
  } else {
    requestAnimationFrame(() => setTimeout(fn, 0));
  }
}
```

### requestAnimationFrame for Visual Updates

```typescript
function animateWithYield(
  elements: HTMLElement[],
  property: string,
  targetValue: number
): void {
  let currentIndex = 0;

  function step(timestamp: number): void {
    const start = performance.now();

    while (currentIndex < elements.length) {
      const elapsed = performance.now() - start;
      if (elapsed > 8) {
        // Used 8ms of our 16ms frame budget
        currentIndex++;
        requestAnimationFrame(step);
        return;
      }

      elements[currentIndex].style[property as any] = `${targetValue}px`;
      currentIndex++;
    }
  }

  requestAnimationFrame(step);
}
```

---

## 6. Image Optimization Baseline

Images are typically 50%+ of page weight. Optimizing them is the highest-impact fix for most sites.

### Why WebP/AVIF

JPEG at quality 80 ≈ 120KB. WebP at quality 80 ≈ 80KB (33% smaller). AVIF at quality 80 ≈ 60KB (50% smaller). Same visual quality, less data transferred, faster LCP.

### Proper Sizing with srcset

```html
<img
  src="/hero-800.webp"
  srcset="
    /hero-400.webp 400w,
    /hero-800.webp 800w,
    /hero-1200.webp 1200w,
    /hero-1600.webp 1600w
  "
  sizes="(max-width: 600px) 400px, (max-width: 1000px) 800px, 1200px"
  width="1200"
  height="675"
  alt="Hero image"
  loading="lazy"
  fetchpriority="low"
/>
```

**Why width/height are mandatory:** Without them, the browser doesn't know the image's aspect ratio until it loads. This causes Cumulative Layout Shift — the space above the image collapses, then jumps when it loads. Setting width/height lets the browser calculate the aspect ratio from CSS and reserve space.

**Why `fetchpriority="low"` on lazy images:** The browser assigns fetch priorities automatically. Images below the fold compete with above-fold images for bandwidth. Explicitly marking them low prevents bandwidth theft.

### Lazy Loading Below the Fold

```html
<!-- Above fold: load immediately -->
<img src="/hero.webp" width="1200" height="675" alt="Hero" fetchpriority="high" />

<!-- Below fold: lazy load -->
<img src="/product.webp" width="400" height="300" alt="Product" loading="lazy" />
```

Never lazy-load the LCP image. The browser's native `loading="lazy"` introduces a delay that can push LCP past the 2,500ms threshold.

---

## 7. Font Optimization

Fonts cause two problems: FOIT (Flash of Invisible Text) and FOUT (Flash of Unstyled Text). Both hurt CLS and perceived performance.

### font-display: swap

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-latin.woff2') format('woff2');
  font-display: swap;
  unicode-range: U+0000-00FF;
}
```

**FOIT vs FOUT:** `font-display: block` shows invisible text for up to 3 seconds (FOIT). `font-display: swap` shows fallback font immediately, then swaps (FOUT). FOUT is better for performance — the user sees content immediately, and the swap is a minor visual change, not a blocking delay.

### Preloading Critical Fonts

```html
<link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />
```

Preloading tells the browser to fetch the font early, before the CSS that references it is discovered. This eliminates the waterfall: CSS discovery → font discovery → font download.

### Font Subsetting

If your site only uses Latin characters, don't ship Cyrillic or CJK glyphs. Use `unicode-range` to serve only what you need:

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF; /* Basic Latin */
  font-display: swap;
}

@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-latin-ext.woff2') format('woff2');
  unicode-range: U+0100-024F; /* Latin Extended */
  font-display: swap;
}
```

---

## 8. Script Loading Strategies

Scripts block HTML parsing unless you specify otherwise. Understanding the difference between `defer`, `async`, and `module` is critical.

### defer

```html
<script src="analytics.js" defer></script>
```

Downloads in parallel with HTML parsing. Executes *after* the HTML is fully parsed, in document order. Preserves DOM order. **Use for scripts that need the DOM.**

### async

```html
<script src="tracking.js" async></script>
```

Downloads in parallel with HTML parsing. Executes *immediately* when downloaded, pausing HTML parsing. Execution order is not guaranteed. **Use for independent scripts (analytics, ads).**

### module

```html
<script type="module" src="app.js"></script>
```

Deferred by default (like `defer`). Executed in strict mode. Imports are resolved. Can be cached and shared across pages. **Use for application code.**

### Impact Table

| Strategy | Downloads | Executes | Blocks Parsing | DOM Order |
|----------|-----------|----------|----------------|-----------|
| None | — | — | Yes (synchronous) | Yes |
| defer | Parallel | After HTML parsed | No | Yes |
| async | Parallel | When downloaded | During execution | No |
| module | Parallel | After HTML parsed (deferred) | No | Yes (within module graph) |

### Real-World Pattern

```html
<!-- Critical app code: defer for DOM access + order guarantee -->
<script src="/js/vendor.js" defer></script>
<script src="/js/app.js" defer></script>

<!-- Non-critical: async for independence -->
<script src="https://analytics.example.com/track.js" async></script>

<!-- Module: ES modules with import maps -->
<script type="module" src="/js/main.js"></script>
```

---

## 9. Metrics Collection Pipeline

Sending performance metrics to a backend endpoint creates a feedback loop — you can track regressions over time and correlate them with deployments.

```typescript
interface VitalsPayload {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  id: string;
  delta: number;
  navigationType: string;
  url: string;
  userAgent: string;
  connectionType: string;
  deviceMemory: number;
  timestamp: number;
}

class MetricsCollector {
  private queue: VitalsPayload[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private endpoint: string,
    private sampleRate: number = 0.1
  ) {
    this.startFlushLoop();
    this.setupVisibilityListener();
  }

  collect(metric: VitalsPayload): void {
    if (Math.random() > this.sampleRate) return;

    this.queue.push({
      ...metric,
      url: window.location.href,
      userAgent: navigator.userAgent,
      connectionType: (navigator as any).connection?.effectiveType ?? 'unknown',
      deviceMemory: (navigator as any).deviceMemory ?? 0,
      timestamp: Date.now(),
    });

    if (this.queue.length >= 10) {
      this.flush();
    }
  }

  private flush(): void {
    if (this.queue.length === 0) return;

    const payload = JSON.stringify(this.queue.splice(0));

    if (navigator.sendBeacon) {
      navigator.sendBeacon(this.endpoint, payload);
    } else {
      fetch(this.endpoint, {
        method: 'POST',
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }

  private startFlushLoop(): void {
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  private setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flush();
      }
    });
  }

  destroy(): void {
    if (this.flushInterval) clearInterval(this.flushInterval);
    this.flush();
  }
}

const collector = new MetricsCollector('/api/vitals', 0.1);
```

**Why `sendBeacon`:** It survives page unload. When the user navigates away, `fetch()` may be cancelled. `sendBeacon()` queues the data and the browser guarantees delivery.

**Why `visibilitychange`:** When the user switches tabs, you lose the chance to send remaining metrics. Flushing on visibility change captures everything before the page goes background.

---

## 10. Before/After Measurement Table

Document every optimization with a measurement table. This creates accountability and helps you decide if a fix was worth the complexity.

```markdown
| Metric | Before | After | Change | Technique |
|--------|--------|-------|--------|-----------|
| LCP | 3,200ms | 1,800ms | -44% | Hero image: WebP + preload + fetchpriority="high" |
| CLS | 0.18 | 0.02 | -89% | Added width/height to all images, font-display: swap |
| FCP | 2,100ms | 1,200ms | -43% | Inlined critical CSS, deferred non-essential JS |
| TBT | 450ms | 120ms | -73% | Split long task into chunks with scheduler.postTask |
| Total Bundle | 380KB | 210KB | -45% | Removed unused lodash imports, tree-shaken date-fns |
| Image Payload | 2.1MB | 680KB | -68% | WebP conversion + responsive srcset + lazy loading |
```

**Rules for honest measurement:**
- Run each measurement 3 times, take the median
- Use the same device and network conditions
- Clear cache between runs
- Test on a mid-range device, not your MacBook Pro
- Log the Lighthouse version and date

A 44% LCP improvement sounds impressive, but if it went from 3,200ms to 1,800ms on a fast connection, your 3G users might still see 6,000ms. Always test under realistic conditions.

---

> **Next:** See [detect.md](./detect.md) if you haven't run detection first. Then proceed to the project files in `./project/` for runnable implementations.
