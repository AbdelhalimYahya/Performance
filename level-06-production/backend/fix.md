# How to Fix & Prevent Production Backend Performance Issues

> A practical guide to implementing observability, fixing common issues, and building resilient production backends.

---

## 1. Setting Up the Observability Stack

The minimal production stack has four components. Each serves a distinct purpose:

| Tool | Purpose | What It Stores |
|------|---------|----------------|
| **Prometheus** | Metrics collection | Time-series numbers (latency, error rates, queue depths) |
| **Grafana** | Visualization | Dashboards built from Prometheus queries |
| **Jaeger** | Distributed traces | Request flow across services (spans) |
| **Loki** | Log aggregation | Structured logs with label-based indexing |

### Local Development with Docker Compose

```yaml
# docker-compose.observability.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:v2.48.0
    ports: ['9090:9090']
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:10.2.2
    ports: ['3001:3000']
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    depends_on: [prometheus]

  jaeger:
    image: jaegertracing/all-in-one:1.52
    ports: ['16686:16686', '4317:4317']

  loki:
    image: grafana/loki:2.9.3
    ports: ['3100:3100']
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'nestjs-app'
    static_configs:
      - targets: ['host.docker.internal:3000']
    metrics_path: '/metrics'
```

In production, replace `static_configs` with service discovery (Kubernetes pods, Consul, etc.).

---

## 2. OpenTelemetry as the Universal Standard

OpenTelemetry (OTel) is vendor-neutral. One SDK gives you traces, metrics, and logs. You can switch from Jaeger to Datadog without changing application code.

### Critical: Initialize Before Imports

OTel must initialize before any other import in `main.ts`. Instrumentations patch HTTP clients and servers at load time — if you import Express before OTel, the patches will not apply.

```typescript
// tracing.ts — imported first in main.ts
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';

// Tracing setup
const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
});

const tracerProvider = new NodeTracerProvider({
  spanProcessors: [new PeriodicExportingSpanProcessor(traceExporter)],
});
tracerProvider.register();

// Metrics setup
const metricsExporter = new PrometheusExporter({ port: 9464 });
const meterProvider = new MeterProvider({
  readers: [metricsExporter],
});
// Register globally for metric instruments
import { metrics } from '@opentelemetry/api';
metrics.setGlobalMeterProvider(meterProvider);

// Auto-instrumentations (must come after provider registration)
import { registerInstrumentations } from '@opentelemetry/instrumentation';
registerInstrumentations({
  instrumentations: [getNodeAutoInstrumentations()],
});

console.log('[OTel] Tracing and metrics initialized');
```

### main.ts Integration

```typescript
// main.ts — first line
import './tracing';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

---

## 3. Instrument NestJS Automatically

Auto-instrumentations patch libraries at load time. No code changes needed.

### What Gets Auto-Instrumented

```typescript
// These libraries are patched automatically:
// @opentelemetry/instrumentation-http       → HTTP client + server
// @opentelemetry/instrumentation-express    → Express middleware layers
// @opentelemetry/instrumentation-pg         → PostgreSQL queries
// @opentelemetry/instrumentation-ioredis    → Redis commands
// @opentelemetry/instrumentation-nestjs-core → NestJS request handling
```

### What You Still Need to Add Manually

- Business logic spans (e.g., "calculate-discount", "validate-payment")
- Queue producer/consumer spans
- External API call spans with custom attributes
- Error recording on caught exceptions

---

## 4. Custom Spans for Business Logic

Auto-instrumentation covers framework-level spans. Business logic needs manual instrumentation.

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service');

async function processOrder(orderId: string) {
  // startActiveSpan creates a span that is automatically set as the current span
  // and closed when the callback completes
  return tracer.startActiveSpan('process-order', async (span) => {
    try {
      span.setAttribute('order.id', orderId);

      // Child span for a sub-operation
      const order = await tracer.startActiveSpan('fetch-order', async (childSpan) => {
        const result = await this.orderRepo.findById(orderId);
        childSpan.setAttribute('order.total', result.total);
        childSpan.end();
        return result;
      });

      // Another child span
      await tracer.startActiveSpan('charge-payment', async (childSpan) => {
        try {
          await this.paymentService.charge(order.total);
          childSpan.setAttribute('payment.success', true);
        } catch (error) {
          childSpan.setAttribute('payment.success', false);
          childSpan.recordException(error); // Attach error details to span
          childSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          throw error;
        } finally {
          childSpan.end();
        }
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return order;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end(); // Always close the span
    }
  });
}
```

---

## 5. Prometheus Metrics Design

### The Four Metric Types

| Type | Use Case | Example |
|------|----------|---------|
| **Counter** | Monotonically increasing values | `http_requests_total` |
| **Gauge** | Values that go up and down | `active_connections` |
| **Histogram** | Distribution of values with configurable buckets | `http_request_duration_ms` |
| **Summary** | Quantiles calculated client-side | **Avoid** — use Histogram + server-side quantiles |

### Naming Convention

Format: `namespace_subsystem_name_unit`

```typescript
import { Counter, Histogram, Gauge } from 'prom-client';

const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  // Bucket boundaries: cover 10ms to 10s
  // Choose based on your SLO targets
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
});

const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  labelNames: ['type'],
});
```

### Choosing Histogram Bucket Boundaries

For latency histograms, buckets should align with your SLO thresholds. If your SLO is "99% of requests under 500ms", your buckets should have fine granularity around 500ms:

```typescript
// Good: buckets cluster around SLO threshold
buckets: [10, 50, 100, 200, 300, 400, 500, 750, 1000, 2000, 5000, 10000]

// Bad: too few buckets, no granularity around SLO
buckets: [100, 1000, 10000]
```

---

## 6. Memory Leak Resolution Pattern

Once a heap snapshot identifies a leak, find the **retaining path** — the chain of references keeping the object alive.

### Common NestJS Leak Patterns

```typescript
// LEAK: Event listener not cleaned up
@Injectable()
export class EventMonitorService implements OnModuleInit, OnModuleDestroy {
  private handler: () => void;

  onModuleInit() {
    this.handler = () => this.handleEvent();
    process.on('data-event', this.handler); // Added on startup
  }

  // Fix: remove the listener on destroy
  onModuleDestroy() {
    process.removeListener('data-event', this.handler);
  }
}

// LEAK: Promise array that grows forever
@Injectable()
export class BackgroundSyncService {
  private pendingPromises: Promise<any>[] = []; // Never cleaned up

  addTask(task: Promise<any>) {
    this.pendingPromises.push(task); // Array grows forever
  }

  // Fix: clean up resolved promises periodically
  addTaskFixed(task: Promise<any>) {
    const wrapped = task.finally(() => {
      this.pendingPromises = this.pendingPromises.filter(p => p !== wrapped);
    });
    this.pendingPromises.push(wrapped);
  }
}

// LEAK: Timer reference not cleared
@Injectable()
export class PollingService implements OnModuleDestroy {
  private timer: NodeJS.Timeout;

  start() {
    this.timer = setInterval(() => this.poll(), 5000);
  }

  onModuleDestroy() {
    clearInterval(this.timer); // Must clear or the timer keeps the process alive
  }
}
```

---

## 7. Circuit Breaker Pattern

Protect against slow external services using the `opossum` library.

```typescript
import CircuitBreaker from 'opossum';

@Injectable()
export class PaymentService {
  private breaker: CircuitBreaker;

  constructor(private readonly httpClient: HttpService) {
    this.breaker = new CircuitBreaker(
      (amount: number) => this.callPaymentAPI(amount),
      {
        timeout: 3000,           // Fail after 3 seconds
        errorThresholdPercentage: 50, // Open circuit at 50% error rate
        resetTimeout: 30000,     // Try again after 30 seconds
        volumeThreshold: 10,     // Need at least 10 requests to evaluate
      }
    );

    // Fallback when circuit is open
    this.breaker.fallback(() => ({
      status: 'pending',
      message: 'Payment will be processed shortly',
    }));

    this.breaker.on('open', () => console.warn('[Circuit] OPEN — payment API failing'));
    this.breaker.on('halfOpen', () => console.log('[Circuit] HALF-OPEN — testing recovery'));
    this.breaker.on('close', () => console.log('[Circuit] CLOSED — payment API recovered'));
  }

  async charge(amount: number) {
    return this.breaker.fire(amount);
  }

  private async callPaymentAPI(amount: number) {
    const response = await firstValueFrom(
      this.httpClient.post('https://api.payment-provider.com/charge', { amount })
    );
    return response.data;
  }
}
```

### Circuit States

- **Closed**: Normal operation. Requests pass through. Errors are counted.
- **Open**: Too many errors. All requests immediately return the fallback. No calls to the external service.
- **Half-Open**: After `resetTimeout`, one test request is allowed through. If it succeeds, circuit closes. If it fails, circuit opens again.

---

## 8. Graceful Degradation

Design APIs that return partial data when dependencies fail.

```typescript
@Injectable()
export class ProductCatalogService {
  async getCatalogPage(productId: string) {
    // Critical path: product data must be available
    const product = await this.productRepo.findById(productId);

    // Non-critical: return cached/empty if DB is slow
    let recommendations: Product[];
    try {
      recommendations = await Promise.race([
        this.recommendationService.getRelated(productId),
        new Promise<Product[]>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 1000)
        ),
      ]);
    } catch {
      recommendations = []; // Graceful degradation: empty array instead of error
    }

    // Non-critical: return cached reviews if review service is down
    let reviews: Review[];
    try {
      reviews = await this.reviewService.getReviews(productId);
    } catch {
      reviews = await this.cacheService.get(`reviews:${productId}`) || [];
    }

    return {
      product,           // Always available
      recommendations,   // May be empty
      reviews,           // May be cached/stale
    };
  }
}
```

---

## 9. SLO Definition and Alerting

### Defining an SLO

An SLO is a target reliability level: "99.9% of requests complete successfully over a 30-day window."

The **error budget** is the inverse: 0.1% of requests are allowed to fail. For 1 million requests/month, that is 1,000 allowed failures.

### Prometheus Alert Rules

```yaml
# alerts.yml
groups:
  - name: slo-alerts
    rules:
      # Alert when error budget is burning too fast
      - alert: SLOBudgetBurnRateHigh
        expr: |
          (
            1 - (
              sum(rate(http_requests_total{status!~"5.."}[1h]))
              /
              sum(rate(http_requests_total[1h]))
            )
          ) < 0.999
          and
          (
            1 - (
              sum(rate(http_requests_total{status!~"5.."}[5m]))
              /
              sum(rate(http_requests_total[5m]))
            )
          ) < 0.999
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "SLO error budget burning too fast"
          description: "Error rate over last hour exceeds SLO threshold"

      # Alert on high latency
      - alert: HighLatencyP99
        expr: |
          histogram_quantile(0.99,
            sum(rate(http_request_duration_ms_bucket[5m])) by (le, route)
          ) > 500
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "p99 latency above 500ms"
          description: "Route {{ $labels.route }} p99 is {{ $value }}ms"
```

---

## 10. Production Profiling Without Downtime

### CPU Profiling via Signal

Node.js supports `--cpu-prof` triggered at runtime:

```bash
# Enable profiling in production
node --cpu-prof ./dist/main.js

# Trigger a profile via SIGUSR2
kill -USR2 <pid>
# Writes a .cpuprofile file to the working directory
```

### Traffic Cloning with tcpdump

Clone production traffic to a staging server for safe profiling:

```bash
# On production: mirror traffic to staging
tcpdump -i eth0 -s 0 -A 'tcp port 3000' | nc staging-server 9999

# On staging: receive and replay
nc -l -p 9999 | tcpflow -C -s -
```

### Clinic.js Flame Graphs

```bash
# Generate a flame graph against a running server
npx clinic flame -- node dist/main.js

# The flame graph opens in the browser
# Look for wide, hot stacks — these are CPU bottlenecks
```

### Analyzing Remotely

Upload `.cpuprofile` files to Chrome DevTools via `chrome://tracing`. The flame chart view shows exactly which functions consume CPU. Focus on the widest bars at the bottom of the stack — these are the root causes.

---

> **Production is not a place to guess.** Instrument everything, alert on SLOs, and profile without downtime. The tools exist — use them.
