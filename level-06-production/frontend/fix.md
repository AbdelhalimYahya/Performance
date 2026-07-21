# How to Fix & Prevent Production Frontend Performance Issues

> Production-grade performance management: regression response, monitoring, budgets, and culture.

---

## 1. Performance Regression Response Protocol

When RUM alerts fire, follow this triage sequence:

### Step 1: Check Deployment Regression

```bash
# Compare metrics before/after the last deploy
# In Grafana: split dashboard by deployment tag
# If regression aligns with deploy timestamp → it's a code change

# Next.js: instant rollback via Vercel
vercel rollback <deployment-url>

# Or revert the commit
git revert HEAD --no-edit
git push origin main
# Vercel auto-deploys from main
```

### Step 2: Check Traffic Pattern Change

```sql
-- Check if mobile traffic surged (mobile is always slower)
SELECT
  device_type,
  COUNT(*) as sessions,
  AVG(lcp_value) as avg_lcp
FROM rum_metrics
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY device_type;
```

If mobile traffic spiked from 40% to 70%, the LCP regression may be device-related, not code-related.

### Step 3: Check Third-Party Issue

```typescript
// Tag RUM metrics with third-party script versions
sendMetric('LCP', value, {
  tagManagerVersion: window.dataLayer?.[0]?.['gtm.version'],
  analyticsVersion: window.ga?.version,
});
```

If LCP degraded after a tag manager update → it's a third-party issue, not your code.

---

## 2. Lighthouse CI Setup End-to-End

### Install and Configure

```bash
npm install --save-dev @lhci/cli
```

```javascript
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000',
        'http://localhost:3000/products',
        'http://localhost:3000/checkout',
      ],
      numberOfRuns: 3,
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'ready on',
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'first-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
      },
    },
    upload: {
      target: 'lhci',
      serverBaseUrl: process.env.LHCI_SERVER_URL,
    },
  },
};
```

### GitHub Actions with PR Status Check

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI
on: [pull_request]
jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Run Lighthouse CI
        run: npx lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
          LHCI_SERVER_URL: ${{ secrets.LHCI_SERVER_URL }}
      - name: Comment PR with Lighthouse Score
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('.lighthouseci/lhr-0.json'));
            const score = results.categories.performance.score * 100;
            const emoji = score >= 90 ? '✅' : score >= 50 ? '⚠️' : '❌';
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `${emoji} **Lighthouse Performance: ${score}/100**\n\n` +
                    `- FCP: ${results.audits['first-contentful-paint'].displayValue}\n` +
                    `- LCP: ${results.audits['largest-contentful-paint'].displayValue}\n` +
                    `- CLS: ${results.audits['cumulative-layout-shift'].displayValue}\n` +
                    `- TBT: ${results.audits['total-blocking-time'].displayValue}`
            });
```

---

## 3. Real User Monitoring Implementation

### Full Pipeline

```typescript
// lib/rum.ts — browser-side collection
import { onLCP, onCLS, onINP, onTTFB } from 'web-vitals';

function sendMetric(metric: any, context: Record<string, string>) {
  const payload = {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    url: location.href,
    path: location.pathname,
    ...context,
    timestamp: Date.now(),
  };

  // Batch and send via sendBeacon (non-blocking)
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/metrics', JSON.stringify(payload));
  }
}

export function initRUM() {
  const context = {
    device: window.innerWidth < 768 ? 'mobile' : 'desktop',
    connection: (navigator as any).connection?.effectiveType || 'unknown',
    experiment: getExperimentGroup(),
  };

  onLCP((metric) => sendMetric(metric, context));
  onCLS((metric) => sendMetric(metric, context));
  onINP((metric) => sendMetric(metric, context));
  onTTFB((metric) => sendMetric(metric, context));
}
```

```typescript
// app/api/metrics/route.ts — server-side ingestion
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const data = await req.json();

  // Store in TimescaleDB / InfluxDB / ClickHouse
  // Example: INSERT INTO rum_metrics (name, value, rating, path, device, connection, timestamp)
  //          VALUES ($1, $2, $3, $4, $5, $6, $7)
  await db.query(
    'INSERT INTO rum_metrics (name, value, rating, path, device, connection, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [data.name, data.value, data.rating, data.path, data.device, data.connection, data.timestamp],
  );

  return NextResponse.json({ ok: true });
}
```

### Grafana Dashboard Query

```sql
-- P75 LCP by device over last 24 hours
SELECT
  time_bucket('1 hour', timestamp) AS time,
  device,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75_lcp
FROM rum_metrics
WHERE name = 'LCP' AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY time, device
ORDER BY time;
```

---

## 4. Performance Budget Enforcement in CI

### JavaScript Budget with size-limit

```json
// package.json
{
  "size-limit": [
    {
      "name": "Initial Bundle",
      "path": ".next/static/chunks/**/*.js",
      "limit": "250 KB",
      "warning": "200 KB"
    },
    {
      "name": "Framework Chunk",
      "path": ".next/static/chunks/framework-*.js",
      "limit": "150 KB"
    },
    {
      "name": "Per-Route Chunks",
      "path": ".next/static/chunks/pages/**/*.js",
      "limit": "30 KB",
      "warning": "20 KB"
    }
  ]
}
```

### Image Budget Script

```typescript
// scripts/check-image-budget.ts
import * as fs from 'fs';
import * as path from 'path';

const MAX_IMAGE_SIZE_KB = 200;
const MAX_TOTAL_IMAGES_MB = 5;

function checkImages(publicDir: string) {
  let totalSize = 0;
  const violations: string[] = [];

  const files = fs.readdirSync(path.join(publicDir, 'images'), { recursive: true });
  for (const file of files) {
    if (typeof file !== 'string') continue;
    const ext = path.extname(file).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'].includes(ext)) continue;

    const sizeKB = fs.statSync(path.join(publicDir, 'images', file)).size / 1024;
    totalSize += sizeKB;

    if (sizeKB > MAX_IMAGE_SIZE_KB) {
      violations.push(`${file}: ${sizeKB.toFixed(0)}KB exceeds ${MAX_IMAGE_SIZE_KB}KB limit`);
    }
  }

  if (totalSize / 1024 > MAX_TOTAL_IMAGES_MB) {
    violations.push(`Total images: ${(totalSize / 1024).toFixed(1)}MB exceeds ${MAX_TOTAL_IMAGES_MB}MB limit`);
  }

  if (violations.length > 0) {
    console.error('Image budget violations:');
    violations.forEach((v) => console.error(`  ❌ ${v}`));
    process.exit(1);
  }

  console.log(`✅ Image budget OK: ${(totalSize / 1024).toFixed(1)}MB total`);
}

checkImages('./public');
```

### GitHub Actions Integration

```yaml
# .github/workflows/budget.yml
- name: Check budgets
  run: |
    npx size-limit
    npx ts-node scripts/check-image-budget.ts
  if: github.event_name == 'pull_request'
```

---

## 5. Error Boundary with Performance Context

```typescript
// components/ErrorBoundary.tsx
'use client';
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface PerformanceSnapshot {
  lcp: number;
  cls: number;
  memoryMB: number;
  longTasks: number;
  url: string;
  timestamp: number;
}

function capturePerformance(): PerformanceSnapshot {
  const memory = (performance as any).memory;
  let lcp = 0;
  try {
    const entries = performance.getEntriesByType('largest-contentful-paint');
    lcp = entries.length > 0 ? entries[entries.length - 1].startTime : 0;
  } catch {}

  return {
    lcp,
    cls: 0,
    memoryMB: memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : 0,
    longTasks: performance.getEntriesByType('longtask').length,
    url: window.location.href,
    timestamp: Date.now(),
  };
}

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; error: Error | null; perf: PerformanceSnapshot | null }
> {
  state = { hasError: false, error: null, perf: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error, perf: capturePerformance() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    fetch('/api/error-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        performance: this.state.perf,
      }),
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h2 className="text-red-800 font-bold">Something went wrong</h2>
          <p className="text-red-600 text-sm mt-1">{this.state.error?.message}</p>
          {this.state.perf && (
            <p className="text-red-500 text-xs mt-2">
              LCP: {this.state.perf.lcp.toFixed(0)}ms | Memory: {this.state.perf.memoryMB}MB
            </p>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
```

---

## 6. Font Loading in Production

### next/font/google with Display Swap

```typescript
// app/layout.tsx
import { Inter, Roboto } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap', // Show fallback font immediately, swap when loaded
  variable: '--font-inter',
});

export default function Layout({ children }) {
  return (
    <html className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

### Font Subsetting for Non-Latin Scripts

```typescript
// Only load the characters you need
import { NotoSansJP } from 'next/font/google';

const notoSansJP = NotoSansJP({
  subsets: ['latin'], // Load only Latin subset
  display: 'swap',
  weight: ['400', '700'],
});
```

### Self-Hosting for GDPR Compliance

```javascript
// next.config.js
module.exports = {
  experimental: {
    fontLoaders: [
      {
        loader: '@next/font/local',
        options: {
          src: './public/fonts/Inter-Regular.woff2',
          display: 'swap',
          variable: '--font-inter',
        },
      },
    ],
  },
};
```

---

## 7. Image CDN Integration

### Cloudinary as next/image Loader

```typescript
// next.config.js
module.exports = {
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
    formats: ['image/avif', 'image/webp'],
  },
};
```

```typescript
// lib/image-loader.ts
export default function cloudinaryLoader({ src, width, quality }: any) {
  const params = [
    `f_auto`, // Auto-format (AVIF/WebP)
    `c_limit`, // Limit to requested dimensions
    `w_${width}`, // Width
    `q_${quality || 'auto'}`, // Quality
  ];
  return `https://res.cloudinary.com/your-cloud/image/upload/${params.join(',')}${src}`;
}
```

### Measuring Image Cache Hit Rate

```typescript
// lib/image-metrics.ts
export function trackImagePerformance() {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const imgEntry = entry as PerformanceResourceTiming;
      sendMetric('ImageLoad', {
        name: imgEntry.name,
        duration: imgEntry.duration,
        transferSize: imgEntry.transferSize,
        cached: imgEntry.transferSize === 0, // 0 = served from cache
      });
    }
  }).observe({ type: 'resource', entryFilters: ['resource-type:image'] });
}
```

---

## 8. Continuous Performance Testing

### Nightly Lighthouse Against Production

```yaml
# .github/workflows/nightly-perf.yml
name: Nightly Performance Audit
on:
  schedule:
    - cron: '0 3 * * *' # 3 AM UTC daily

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Lighthouse against production
        run: |
          npx lhci autorun --collect.url=https://yourapp.com \
                           --collect.url=https://yourapp.com/products \
                           --upload.target=lhci
        env:
          LHCI_SERVER_URL: ${{ secrets.LHCI_SERVER_URL }}
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

### Performance Trend Chart

```sql
-- Weekly LCP trend from LHCI server
SELECT
  date_trunc('week', run.created_at) AS week,
  AVG(jsonb_object_value_numeric(lhr, 'categories', 'performance', 'score')) AS avg_score
FROM build
JOIN run ON run.build_id = build.id
WHERE build.project_token = 'your-token'
GROUP BY week
ORDER BY week;
```

---

## 9. Feature Flag for Performance

```typescript
// lib/feature-flags.ts
export function isHeavyFeatureEnabled(): boolean {
  // Check experiment group from cookie/localStorage
  const group = localStorage.getItem('experiment-group');
  return group === 'variant-a'; // Only 10% of users get the heavy feature
}

// In a component
'use client';
import { useState, useEffect } from 'react';

export function Dashboard() {
  const [heavyChart, setHeavyChart] = useState(null);

  useEffect(() => {
    if (isHeavyFeatureEnabled()) {
      // Only load heavy chart library for experiment group
      import('./HeavyChart').then((m) => setHeavyChart(() => m.default));
    }
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      {heavyChart ? <heavyChart /> : <div className="animate-pulse bg-gray-200 h-64" />}
    </div>
  );
}
```

### Measuring Feature Flag Impact

```typescript
// After loading the feature, tag RUM metrics
sendMetric('LCP', value, {
  experiment: localStorage.getItem('experiment-group') || 'control',
});

// In Grafana: compare LCP between control and variant
// SELECT experiment, percentile_cont(0.75) WITHIN GROUP (ORDER BY value)
// FROM rum_metrics WHERE name = 'LCP'
// GROUP BY experiment;
```

---

## 10. Performance Culture

### PR Checklist Addition

```markdown
## Performance Checklist
- [ ] Bundle size within budget (size-limit passes)
- [ ] No new images added without explicit width/height
- [ ] New components wrapped in ErrorBoundary if they fetch data
- [ ] Third-party scripts loaded with `next/dynamic` or `loading="lazy"`
- [ ] New API calls have loading states (no layout shift on resolve)
```

### Weekly Performance Review Agenda

```markdown
# Weekly Performance Review

1. **RUM Dashboard Review** (5 min)
   - LCP/CLS/INP trends vs last week
   - Any alerts triggered?

2. **Lighthouse Score Trend** (5 min)
   - Score changes across routes
   - New regressions?

3. **Bundle Size Report** (5 min)
   - Size-limit results
   - New large dependencies?

4. **Action Items** (10 min)
   - Performance tickets created
   - Blocked items escalated
```

### Performance OKRs

```
Q2 2024 Performance OKRs:

O: Improve Core Web Vitals to "Good" across all pages
  KR1: LCP p75 < 2500ms on mobile (currently 3200ms)
  KR2: CLS p75 < 0.1 (currently 0.15)
  KR3: INP p75 < 200ms (currently 350ms)

O: Establish performance governance
  KR1: Lighthouse CI on 100% of PRs
  KR2: Performance budget violations = 0 per sprint
  KR3: RUM coverage > 90% of sessions
```

---

> **Next:** See [detect.md](./detect.md) for detection methods, then the project files in `./project/` for runnable implementations.
