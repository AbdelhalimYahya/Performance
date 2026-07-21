<div align="center">

# ⚡ Frontend & Backend Performance Mastery

**Production-grade performance patterns for React, Next.js, Node.js, Express & NestJS — detect, diagnose, and fix at every layer.**

![GitHub Stars](https://img.shields.io/github/stars/YOUR_USERNAME/frontend-backend-performance-mastery?style=flat-square)
![GitHub Forks](https://img.shields.io/github/forks/YOUR_USERNAME/frontend-backend-performance-mastery?style=flat-square)
![License](https://img.shields.io/github/license/YOUR_USERNAME/frontend-backend-performance-mastery?style=flat-square)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)
![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square)
![TypeScript](https://img.shields.io/badge/typescript-5-blue?style=flat-square)

![React](https://img.shields.io/badge/react-18-61dafb?style=flat-square)
![Next.js](https://img.shields.io/badge/next.js-14-black?style=flat-square)
![NestJS](https://img.shields.io/badge/nest.js-10-e0234e?style=flat-square)
![PostgreSQL](https://img.shields.io/badge/postgresql-15-4169e1?style=flat-square)
![Redis](https://img.shields.io/badge/redis-7-dc382d?style=flat-square)

This is a structured, level-based performance engineering repository. It covers the full stack — from measuring your first Core Web Vital to building a production OpenTelemetry pipeline. Every level has runnable code, not toy examples. If you build software that users interact with, this repo will teach you how to make it faster.

</div>

---

## Why This Repo Exists

Most performance content online is shallow. It tells you to "use a CDN" or "enable gzip" without showing you how to measure whether it actually helped, what tradeoffs you introduced, or how to detect the next bottleneck. This repo goes deep. Every guide is backed by real production code — not snippets, not pseudocode, not "TODO: implement this." You will run the code, break it, fix it, and measure the difference.

Performance is not one skill. It is a stack of skills spanning frontend rendering, backend throughput, caching strategies, database query optimization, network efficiency, and infrastructure observability. A React developer who does not understand event loop lag will ship slow code. A backend engineer who does not know how to read a flame graph will waste days chasing the wrong bottleneck. This repo teaches all layers, in order, so you build a complete mental model of where time goes in a full-stack application.

Every level follows the same structure: **detect first, fix second, prove it with working code.** This is how senior engineers actually think. You do not start by optimizing — you start by measuring. You do not apply fixes blindly — you understand why they work and when they do not. The detect → fix → project pattern forces discipline. By Level 06, you will have built a full production observability stack with Lighthouse CI, Real User Monitoring, Prometheus metrics, and distributed tracing with Jaeger.

---

## Repo Structure

```
frontend-backend-performance-mastery/
├── level-01-fundamentals/
│   ├── frontend/
│   │   ├── detect.md
│   │   ├── fix.md
│   │   └── project/
│   └── backend/
│       ├── detect.md
│       ├── fix.md
│       └── project/
├── level-02-rendering/
│   ├── frontend/
│   │   ├── detect.md
│   │   ├── fix.md
│   │   └── project/
│   └── backend/
│       ├── detect.md
│       ├── fix.md
│       └── project/
├── level-03-caching/
│   ├── frontend/
│   │   ├── detect.md
│   │   ├── fix.md
│   │   └── project/
│   └── backend/
│       ├── detect.md
│       ├── fix.md
│       └── project/
├── level-04-database/
│   ├── frontend/
│   │   ├── detect.md
│   │   ├── fix.md
│   │   └── project/
│   └── backend/
│       ├── detect.md
│       ├── fix.md
│       └── project/
├── level-05-advanced/
│   ├── frontend/
│   │   ├── detect.md
│   │   ├── fix.md
│   │   └── project/
│   └── backend/
│       ├── detect.md
│       ├── fix.md
│       └── project/
├── level-06-production/
│   ├── frontend/
│   │   ├── detect.md
│   │   ├── fix.md
│   │   └── project/
│   └── backend/
│       ├── detect.md
│       ├── fix.md
│       └── project/
├── docs/
│   ├── DP1.docx
│   └── DP2.docx
├── LICENSE
├── CONTRIBUTING.md
└── README.md
```

Each level contains two sides — frontend and backend. Each side contains a detect guide (how to find the problem), a fix guide (how to solve it), and a runnable project (proof that the fix works).

---

## Learning Path

| Level | Topic | Frontend Focus | Backend Focus | Key Technologies | Difficulty |
|-------|-------|----------------|---------------|------------------|------------|
| **01** | Fundamentals | Web Vitals, Profiling, Baselines | Benchmarking, clinic.js, autocannon | web-vitals, Lighthouse, PerformanceObserver, Pino | ⭐⭐ |
| **02** | Rendering | SSR vs CSR vs SSG, React Fiber, Hydration | Response streaming, fast-json-stringify | Next.js App Router, React Profiler, Suspense | ⭐⭐⭐ |
| **03** | Caching | React Query, SWR, Service Workers | Redis, Cache-aside, HTTP headers, CDN | Redis, ioredis, cache-manager, Workbox | ⭐⭐⭐ |
| **04** | Database & API | Infinite scroll, Cursor pagination UI, Optimistic UI | Query optimization, N+1, DataLoader, Indexes | Prisma, PostgreSQL, DataLoader, pg | ⭐⭐⭐⭐ |
| **05** | Advanced | Code splitting, WASM, Tree shaking, Bundle CI | Worker threads, Cluster, Bull Queue, gRPC, Streams | Piscina, @grpc/grpc-js, Bull, Node.js streams | ⭐⭐⭐⭐⭐ |
| **06** | Production | Lighthouse CI, RUM, CWV Dashboard, Error boundaries | OpenTelemetry, Prometheus, Distributed tracing, Memory leaks | OTel SDK, prom-client, Jaeger, Grafana | ⭐⭐⭐⭐⭐ |

---

## How to Navigate This Repo

Every folder follows the same three-file structure:

1. **`detect.md`** — Read this first. It tells you what to look for, which tools to use, and what the symptoms mean. You do not open DevTools until you have read this. Detection is a skill, not an instinct.

2. **`fix.md`** — Read this second. Each fix has a before/after comparison, explains when to apply it and when not to, and shows the actual code change. No "just use a CDN" — every fix has measurable impact.

3. **`project/`** — Run this third. Every project is a fully runnable application (Next.js frontend, NestJS backend) that demonstrates the problem and the fix. You can break it, fix it, and measure the difference yourself.

The philosophy is simple: **never fix what you have not measured, never measure what you cannot reproduce.** The detect guides teach you what to measure. The project folders let you reproduce it. The fix guides show you how to act on what you found.

### How to Use the Detect Guides

Each `detect.md` file is a checklist of symptoms and their causes. Read it before opening any profiling tool. The guides are ordered by likelihood — the most common causes come first. Follow them in order. By the time you reach the bottom, you will have either found the problem or ruled out the obvious suspects.

### How to Use the Fix Guides

Each `fix.md` file has three parts: the fix itself (with before/after code), a decision table showing when to apply it and when not to, and a measurement section showing how to verify the improvement. Not every optimization is worth the complexity. The decision tables help you decide.

### How to Run the Projects

Every `project/` folder is a self-contained application. Navigate to it, run `npm install`, and start it with the appropriate script. The projects are designed to be broken — try introducing artificial lag, disabling caching, or removing indexes. Then apply the fixes from the guide and measure the difference. This is how you build intuition for performance work.

---

## Quick Start

### Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/frontend-backend-performance-mastery.git
cd frontend-backend-performance-mastery
```

### Run a Frontend Project

```bash
cd level-01-fundamentals/frontend/project
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run a Backend Project

```bash
cd level-01-fundamentals/backend/project
npm install
npm run start:dev
```

The NestJS API starts on [http://localhost:3000](http://localhost:3000).

### Run Benchmarks

```bash
cd level-01-fundamentals/backend/project
npm run bench
```

This fires `autocannon` at 100 concurrent connections for 30 seconds and prints a latency table.

### Run Lighthouse

```bash
cd level-06-production/frontend/project
npm install
npm run build
npm run lhci
```

This runs Lighthouse CI against your built app and uploads results to temporary public storage.

### Run the Observability Stack

```bash
cd level-06-production/backend/project
docker-compose -f docker-compose.monitoring.yml up -d
npm install
npm run start:dev
```

This starts Prometheus on port 9090, Grafana on port 3001, and Jaeger on port 16686. Open Grafana at [http://localhost:3001](http://localhost:3001) (login: admin/admin) and navigate to the pre-provisioned NestJS Production Dashboard.

### Run Memory Leak Detection

```bash
cd level-06-production/backend/project
npm install
npm run start:dev
```

Then trigger the demo leak:

```bash
curl http://localhost:3000/memory/leak/start
# Wait 60 seconds for the monitor to detect the trend
curl http://localhost:3000/memory/leak/status
curl http://localhost:3000/memory/leak/stop
curl http://localhost:3000/memory/gc
```

---

## Performance Budgets

This repo enforces performance budgets at every level. The budget configuration is in `.perfbudget.json` at the project root:

```json
{
  "lighthouse": {
    "performance": 85,
    "lcp": 2500,
    "cls": 0.1,
    "inp": 200,
    "tbt": 200,
    "fcp": 1800
  },
  "bundle": {
    "initialKB": 200,
    "perChunkKB": 100,
    "totalKB": 900
  }
}
```

Run the budget check:

```bash
cd level-06-production/frontend/project
ts-node scripts/perf-budget.ts --url http://localhost:3000
```

This runs Lighthouse against every route, checks bundle sizes against the manifest, and prints a pass/fail table. Exit code 1 means a budget was exceeded. Use `--warn-only` to adopt budgets gradually.

---

## Prerequisites

- **Node.js >= 20** — check with `node --version`
- **npm >= 9** or **pnpm >= 8**
- **Docker** (optional, needed for Redis and PostgreSQL in Levels 03, 04, and 06)
- A terminal with basic Unix commands
- Basic familiarity with React and Node.js — this is not a beginner repo
- Recommended: VS Code with ESLint and Prettier extensions

---

## What You Will Learn

### Frontend

- How to read Lighthouse reports and Chrome DevTools flame charts
- How to measure Core Web Vitals (LCP, INP, CLS, FCP, TBT) in production with Real User Monitoring
- How React reconciliation and the Fiber architecture work internally
- How to implement code splitting with `React.lazy()` and dynamic imports that actually reduce bundle size
- How tree shaking works under the hood and why it often does not (and how to fix it)
- How to integrate WebAssembly into a Next.js app with a JavaScript fallback
- How to build Service Workers with Workbox using stale-while-revalidate, cache-first, and network-first strategies
- How to set up Lighthouse CI in GitHub Actions with budget enforcement on every pull request
- How to build a Core Web Vitals dashboard that visualizes real user data by device class and page

### Backend

- How to profile a Node.js process with clinic.js and read flame graphs to find CPU bottlenecks
- How to find and fix N+1 queries with Prisma and DataLoader
- How to implement cursor-based pagination that stays fast at 10M rows
- How to use worker threads and Piscina for CPU-bound tasks without blocking the event loop
- How to cluster a NestJS application across all CPU cores with PM2
- How to instrument a backend with OpenTelemetry for distributed tracing across microservices
- How to build a Prometheus metrics system with Grafana dashboards showing latency percentiles, error rates, and queue depth
- How to detect and diagnose memory leaks in production with heap snapshots and linear regression trend analysis
- How to implement circuit breakers with opossum to protect against slow third-party services

---

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend Runtime** | React 18, Next.js 14 (App Router), TypeScript 5 |
| **Frontend Tooling** | Webpack, @next/bundle-analyzer, source-map-explorer, size-limit, Workbox |
| **Frontend Monitoring** | web-vitals, Lighthouse, @lhci/cli, PerformanceObserver API |
| **Backend Runtime** | Node.js 20+, NestJS 10, Express 4 |
| **Backend Data** | PostgreSQL 15, Prisma, Redis 7, ioredis, Bull Queue |
| **Backend Monitoring** | OpenTelemetry, prom-client, Jaeger, Grafana, Prometheus |
| **Developer Tooling** | clinic.js, autocannon, Piscina, DataLoader, pino |
| **CI/CD** | GitHub Actions, Lighthouse CI, size-limit, Docker Compose |

---

## Project Examples — What Each Builds

### Level 01: Fundamentals

The frontend project is a live performance dashboard running on Next.js that measures and displays Web Vitals in real time. Run `npm run dev`, open `localhost:3000`, and watch LCP, INP, and CLS update live. Click "Run Render Test" to stress-test React rendering and see actual millisecond costs. The backend project is a NestJS API with a profiling interceptor on every route — every request logs its duration, memory delta, and adds `Server-Timing` headers. Run `npm run bench` to fire `autocannon` at 100 concurrent connections and read the p50/p99 latency table from the terminal output.

### Level 02: Rendering

The frontend project demonstrates CSR vs SSR vs streaming SSR side by side. Navigate to `/comparison` and watch React Server Components hydrate, see how Suspense boundaries affect TTFB, and compare render counts with the React Profiler. The backend project exposes a streaming endpoint at `/stream` that sends JSON data in chunks using `ReadableStream` — watch the response arrive in real time in the browser DevTools Network tab. You will see the difference between buffering the entire response and streaming it.

### Level 03: Caching

The frontend project has a full React Query + SWR + Service Worker caching stack. Navigate to `/cache-demo` to see stale-while-revalidate in action, prefetch on hover, and offline-first behavior via Workbox. The backend project is a NestJS API with Redis-backed cache-aside, HTTP cache headers (`ETag`, `Cache-Control`), and a cache invalidation system with event-driven TTL. Run `npm run start:dev`, hit an endpoint twice, and watch the second response come back in under 5ms from Redis.

### Level 04: Database & API

The frontend project has infinite scroll, cursor-based pagination, and optimistic UI updates. Navigate to `/infinite-scroll` and watch React Query handle page prefetching automatically. The backend project is a NestJS API with Prisma, demonstrating N+1 query detection with DataLoader, cursor-based pagination benchmarked against offset pagination at 10M rows, and index advisor recommendations. Run `npm run bench` to see the cursor vs offset latency comparison.

### Level 05: Advanced

The frontend project demonstrates code splitting with `React.lazy()`, WebAssembly integration with a JS fallback, and tree shaking validation. Navigate to `/splitting` and watch chunks load on demand. The backend project has worker thread pools with Piscina, PM2 cluster mode, Bull Queue with 5 queue types, a streaming CSV pipeline, and a gRPC vs REST benchmark. Run `npm run workers:test` to see CPU-bound tasks run in parallel across 4 worker threads.

### Level 06: Production

The frontend project has Lighthouse CI in GitHub Actions (`.github/workflows/lighthouse.yml`), a Real User Monitoring system (`src/lib/rum.ts`), a Core Web Vitals dashboard with device class breakdown, error boundaries with performance context capture, and a performance budget enforcement script. The backend project has full OpenTelemetry instrumentation, Prometheus metrics with a Grafana dashboard, distributed tracing with Jaeger, memory leak detection with linear regression, CPU profiling via inspector, and a comprehensive health check endpoint. Run `docker-compose -f docker-compose.monitoring.yml up` to start the full observability stack locally.

### How the Levels Connect

The levels are designed to build on each other. Level 01 gives you the vocabulary — you learn what LCP, INP, and CLS mean, and how to measure them. Level 02 teaches you what to do when measurement shows a problem. Level 03 introduces caching, which is the single highest-impact optimization for most applications. Level 04 tackles the database layer, where most backend performance problems actually live. Level 05 covers advanced patterns for when the standard solutions are not enough. Level 06 ties everything together with production observability — the systems that tell you when performance degrades and why.

You do not have to go in order. If you already know Web Vitals, skip to Level 03. If you need to fix a slow database, jump to Level 04. But if you are starting fresh, the progression is designed to give you a complete foundation.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines. Summary:

- **All examples must be runnable.** No pseudocode, no "implement this here," no stubs. If it is in a `project/` folder, `npm install && npm run dev` must work.
- **No pseudo-code.** Every code block must be TypeScript that compiles and runs. Every config must be valid JSON/YAML.
- **Every contribution must include a before/after measurement.** If you are adding an optimization, show the metric it improves. If you are adding a detection guide, show the tool output it produces.

### What Makes a Good Contribution

The best contributions are things you have actually debugged in production. A memory leak you found at 3 AM. A query that went from 2 seconds to 50 milliseconds. A cache strategy that cut your Redis bill in half. Real experience beats theoretical knowledge every time.

---

## Repository Stats

| Metric | Count |
|--------|-------|
| **Levels** | 6 |
| **Runnable projects** | 12 (6 frontend + 6 backend) |
| **Detect guides** | 12 |
| **Fix guides** | 12 |
| **TypeScript files** | 200+ |
| **Total lines of code** | 15,000+ |
| **Grafana dashboards** | 2 |
| **GitHub Actions workflows** | 2 |

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Acknowledgements

This repository is built on the work of the [web-vitals](https://github.com/GoogleChrome/web-vitals) team at Google, the [NestJS](https://nestjs.com) team, the [Prisma](https://www.prisma.io) team, and the [OpenTelemetry](https://opentelemetry.io) project. The profiling tools — clinic.js, autocannon, and 0x — are maintained by the Fastify community and are essential to Node.js performance work. Thank you to every contributor who has submitted a PR, reported an issue, or shared this repo with their team.

---

## Who This Is For

This repo is for engineers who have shipped code to production and seen it slow down under real load. It is for frontend developers who know their Lighthouse score but do not know why it dropped. It is for backend engineers who have a slow API endpoint but do not know if the problem is the database, the cache, the network, or the event loop. It is for full-stack engineers who want to build performance into their applications from the start, not bolt it on after the incident postmortem.

If you are a beginner looking for your first React tutorial, this is not the right repo. If you are an experienced engineer who wants to go deeper, this is exactly right.

---

<div align="center">

**If this repo helped you ship faster code, give it a ⭐ — it helps others find it.**

[Your Name](https://x.com/abdelhaleem175) | [Your LinkedIn](https://www.linkedin.com/in/abdelhalim-yahya-033784335)

</div>
