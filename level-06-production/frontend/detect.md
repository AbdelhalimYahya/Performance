# How to Detect Production Frontend Performance Regressions

> Why DevTools are not enough — and the three-layer detection stack that catches regressions before users notice.

---

## 1. The Production Detection Problem

### Lab Data vs Field Data

DevTools and Lighthouse run in **lab conditions**: throttled CPU, throttled network, no other tabs open, no user scrolling or clicking. This is **synthetic testing** — it measures the page in isolation.

**Field data** (Real User Monitoring) captures what users actually experience:
- 60% of users are on mid-range Android phones (not your MacBook Pro)
- Real network is 3G/4G, not simulated "Fast 3G" in DevTools
- Users have 15 tabs open, other apps running, battery saver mode on
- Users scroll, click, type, and trigger layout shifts you never see in lab

A page scoring 95 in Lighthouse can have terrible real-world CWV because:
- Lighthouse tests the **first load** on a fast connection
- Real users experience **subsequent navigations** on slower devices
- Lighthouse doesn't capture **interaction-driven** layout shifts
- Lighthouse doesn't capture **memory pressure** from long sessions

### The Three-Layer Detection Stack

```
┌─────────────────────────────────────────────────┐
│  Layer 1: CI Gates (prevent regression)         │
│  Lighthouse CI, size-limit, bundle analysis     │
│  Runs on every PR — blocks merge if regression  │
├─────────────────────────────────────────────────┤
│  Layer 2: RUM (detect in production)            │
│  PerformanceObserver, Core Web Vitals           │
│  Collects real user metrics continuously        │
├─────────────────────────────────────────────────┤
│  Layer 3: Alerting (notify on regression)       │
│  Threshold alerts, anomaly detection            │
│  PagerDuty/Slack when CWV degrades             │
└─────────────────────────────────────────────────┘
```

- **Layer 1** catches regressions before they ship
- **Layer 2** catches regressions that slip through (device-specific, network-specific)
- **Layer 3** catches regressions from external factors (third-party scripts, infrastructure)

---

## 2. Core Web Vitals in the Wild

### How CWV Differ Between Lab and Field

| Metric | Lab (Lighthouse) | Field (RUM) |
|--------|-----------------|-------------|
| LCP | 1.2s (fast device, cache) | 2.8s (mid-range Android, 4G) |
| CLS | 0.02 (no user interaction) | 0.12 (users scrolling, ads loading) |
| INP | 45ms (no other JS running) | 280ms (other tabs, memory pressure) |
| TTFB | 180ms (edge server) | 600ms (mobile network, DNS) |

### Reading Chrome UX Report (CrUX)

CrUX is Google's field data from real Chrome users. It's the source of truth for CWV.

```typescript
// Fetch CrUX data via PageSpeed Insights API
const url = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com';
const res = await fetch(url);
const data = await res.json();

// CrUX metrics are at data.loadingExperience.metrics
const lcp = data.loadingExperience.metrics.LARGEST_CONTENTFUL_PAINT_MS;
console.log(`LCP p75: ${lcp.percentile}ms`); // 75th percentile of real users
console.log(`LCP category: ${lcp.category}`); // "GOOD", "NEEDS_IMPROVEMENT", "POOR"
```

### What p75 Means

p75 = 75th percentile. 75% of real users experience this metric **at or below** this value.

- p75 LCP < 2500ms → 75% of users have good LCP
- p75 LCP = 4000ms → 75% of users wait 4+ seconds for content
- **Why p75 not p50**: p50 (median) hides the worst 50%. p75 captures the experience of most users while excluding extreme outliers.

---

## 3. Lighthouse CI as a Regression Gate

### How LHCI Works in CI

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI
on: [pull_request]
jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: treosh/lighthouse-ci-action@v12
        with:
          urls: |
            http://localhost:3000
            http://localhost:3000/products
          budgetPath: ./lighthouse-budget.json
```

### Comparing Current vs Baseline

LHCI stores results and compares against the previous build:
- If LCP regresses by >200ms → audit fails
- If CLS regresses by >0.05 → audit fails
- If bundle size increases by >10KB → size-limit fails

### What a Failed Audit Looks Like

```
❌ categories:performance: expected ≥0.9 but was 0.82
❌ largest-contentful-paint: expected ≤2500 but was 3200
⚠️ total-blocking-time: expected ≤300 but was 380

Error: Lighthouse CI assert failed.
```

### Per-Route Thresholds

```json
{
  "assertions": {
    "categories:performance": ["error", { "minScore": 0.9 }],
    "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
    "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }]
  }
}
```

---

## 4. Real User Monitoring Detection

### PerformanceObserver in Production

```typescript
// Collect CWV from real user sessions
function initRUM() {
  // LCP
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    sendMetric('LCP', last.startTime);
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  // CLS
  let clsValue = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!(entry as any).hadRecentInput) {
        clsValue += (entry as any).value;
      }
    }
    sendMetric('CLS', clsValue);
  }).observe({ type: 'layout-shift', buffered: true });

  // Long tasks (blocks interactivity)
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration > 50) {
        sendMetric('LongTask', entry.duration);
      }
    }
  }).observe({ type: 'longtask', buffered: true });
}
```

### Sampling Strategy

Don't report every session — it's too much data and impacts performance:
- **1% sampling** for high-traffic sites (>100K pageviews/day)
- **10% sampling** for medium-traffic sites
- **100% sampling** for low-traffic sites (<10K pageviews/day)

```typescript
function shouldSample(): boolean {
  return Math.random() < 0.01; // 1% sampling
}
```

### Segmentation

Break down metrics by:
- **Device class**: mobile vs desktop (mobile is usually 2-3x worse)
- **Connection type**: 4G vs 3G vs WiFi (3G adds 500-1000ms to LCP)
- **Route**: /checkout may be slower than /home
- **Geography**: different CDNs, different network infrastructure

---

## 5. Detecting JavaScript Errors Causing Performance Impact

### How Errors Block Rendering

An uncaught error in a React component triggers:
1. Error boundary catches it → renders fallback UI
2. The component tree below the boundary unmounts
3. React reconciliation runs for the fallback
4. If no error boundary → entire app crashes → white screen

### Correlating Errors with CWV

```typescript
// Send error + performance context together
window.addEventListener('error', (event) => {
  sendMetric('Error', {
    message: event.message,
    lcp: getCurrentLCP(),
    cls: getCurrentCLS(),
    url: location.href,
  });
});
```

If error rate spikes when LCP degrades, the error is likely causing the performance issue (e.g., an error in a critical component triggers re-renders).

---

## 6. Detecting Third-Party Regressions

### The Problem

A third-party script (analytics, ads, chat widget) updates silently. Your bundle didn't change, but performance regresses because:
- New version loads additional scripts
- New version runs more CPU-heavy code
- New version makes more network requests

### Detection Strategy

Tag RUM metrics with third-party script versions:

```typescript
// After loading third-party script
sendMetric('ThirdPartyLoad', {
  script: 'analytics.js',
  version: window.analyticsVersion,
  loadTime: performance.now(),
});

// In RUM dashboard, compare metrics before/after version change
```

---

## 7. A/B Test Performance Impact Detection

### Segment RUM by Experiment Group

```typescript
// After A/B test initializes
const group = getExperimentGroup(); // 'control' or 'variant-a'
sendMetric('LCP', lcpValue, { experiment: group });
```

### Statistical Significance

Performance differences need statistical significance:
- **Sample size**: at least 1000 sessions per group
- **Duration**: at least 7 days (captures weekday/weekend variation)
- **Effect size**: LCP difference >200ms is meaningful (not noise)

---

## 8. Bundle Size Regression Detection

### size-limit in CI

```json
{
  "size-limit": [
    {
      "path": ".next/static/chunks/**/*.js",
      "limit": "250 KB",
      "warning": "200 KB"
    }
  ]
}
```

### Detecting New Large Dependencies

```bash
# Compare bundle before/after dependency update
npx size-limit --json > before.json
npm update
npx size-limit --json > after.json
diff before.json after.json
```

---

## 9. Alerting Strategy

### What to Alert On (Not Just Monitor)

| Metric | Alert Threshold | Why This Threshold |
|--------|----------------|-------------------|
| LCP p75 | >4000ms | 2.5s is "good", but alerts need headroom to avoid noise |
| INP p75 | >500ms | Users feel input delay above 500ms |
| CLS p75 | >0.25 | Layout shifts above 0.25 are visually disruptive |
| Error rate | >1% of sessions | More than 1 in 100 users seeing errors |
| Bundle size | >300KB initial | Performance budget violation |

### Avoiding Alert Fatigue

- **Don't alert on p50** — p50 is too stable, won't catch regressions in tail users
- **Don't alert on single data points** — require 3 consecutive violations
- **Use severity levels** — LCP 4-5s is "warning", >5s is "critical"
- **Aggregate by route** — don't alert on every page, alert on /checkout specifically

---

## 10. Diagnostic Checklist

| # | Symptom | Likely Cause | Detection Method | Tool | Action |
|---|---------|-------------|-----------------|------|--------|
| 1 | LCP >4s on mobile | Unoptimized images | RUM p75 LCP by device | CrUX / RUM | Add srcset, WebP, lazy loading |
| 2 | CLS >0.25 | Ads/images without dimensions | RUM CLS entries | PerformanceObserver | Set explicit width/height |
| 3 | INP >500ms | Long JavaScript tasks | Long task entries | PerformanceObserver | Code split, defer non-critical |
| 4 | TTFB >1800ms | Slow server response | RUM TTFB | Navigation API | CDN, cache, DB optimization |
| 5 | Bundle >300KB | Large dependency added | size-limit in CI | @size-limit/preset-app | Remove/replace dependency |
| 6 | Error rate >1% | Uncaught exceptions | Error boundary logs | Sentry/LogRocket | Fix error, add error boundary |
| 7 | High CLS on scroll | Sticky elements shifting | Layout shift entries | PerformanceObserver | Reserve space, CSS sticky |
| 8 | Slow TBT | Blocking JavaScript | Total Blocking Time | Lighthouse CI | Move to worker, defer |
| 9 | Third-party regression | Script update | RUM version tagging | Custom | Pin version, lazy load |
| 10 | Memory leak | Growing heap | Heap usage trend | Performance.memory | Fix listener/closure leaks |
| 11 | FOIT/FOUT | Font loading delay | Font display check | Lighthouse | font-display: swap |
| 12 | Waterfall in data fetching | Sequential API calls | Network waterfall | DevTools | Parallel fetch, prefetch |
| 13 | Render-blocking CSS | Inline critical CSS | Lighthouse | Lighthouse | Inline above-fold CSS |
| 14 | Excessive DOM nodes | Deep component tree | DOM size check | Lighthouse | Virtualize long lists |
| 15 | Unminified JS/CSS | Build config issue | Lighthouse | Lighthouse | Check build minification |
| 16 | Missing compression | No gzip/brotli | Response headers | curl -H Accept-Encoding | Enable server compression |
| 17 | Large hero image | No responsive images | Image audit | Lighthouse | srcset + sizes attribute |
| 18 | Client-side routing delay | Heavy route bundles | Navigation timing | Performance API | Prefetch on hover |
| 19 | Hydration mismatch | SSR/CSR mismatch | React warnings | React DevTools | Fix hydration errors |
| 20 | Slow form submission | Blocking validation | Form timing | Custom metrics | Debounce, async validation |
| 21 | Re-render storm | Unoptimized state | React Profiler | React DevTools | Memo, useCallback |
| 22 | Stale API responses | Cache invalidation | Freshness check | Custom | SWR/React Query |
| 23 | Long animation frames | CSS/JS animation | Animation frames | PerformanceObserver | GPU-accelerate, will-change |
| 24 | Excessive reflows | DOM reads after writes | Layout count | PerformanceObserver | Batch reads/writes |
| 25 | Preload not used | Critical resources not preloaded | Lighthouse | Lighthouse | Add preload hints |

---

> **Next:** See [fix.md](./fix.md) for production monitoring and observability solutions.
