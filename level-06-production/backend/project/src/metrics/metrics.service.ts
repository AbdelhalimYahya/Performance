/**
 * METRICS SERVICE — Application Metric Instruments
 *
 * Defines all infrastructure and business-level Prometheus metrics.
 * Provides helper methods for recording HTTP, DB, cache, and event loop metrics.
 *
 * Infrastructure: HTTP requests, DB queries, cache access, event loop lag
 * Business: orders, payments, active users, queue depth
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Gauge,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private eventLoopTimer: ReturnType<typeof setInterval> | null = null;
  private lastTick = process.hrtime.bigint();

  // ─── Infrastructure Metrics ──────────────────────────────────────────

  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
  });

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  });

  readonly httpRequestsInFlight = new Gauge({
    name: 'http_requests_in_flight',
    help: 'Number of HTTP requests currently being processed',
    labelNames: ['route'] as const,
  });

  readonly dbQueryDuration = new Histogram({
    name: 'db_query_duration_seconds',
    help: 'Database query duration in seconds',
    labelNames: ['operation', 'table'] as const,
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  });

  readonly dbConnectionsActive = new Gauge({
    name: 'db_connections_active',
    help: 'Number of active database connections',
  });

  readonly cacheHitsTotal = new Counter({
    name: 'cache_hits_total',
    help: 'Total cache access attempts',
    labelNames: ['cache_name', 'result'] as const, // result: "hit" | "miss"
  });

  readonly eventLoopLagSeconds = new Gauge({
    name: 'event_loop_lag_seconds',
    help: 'Event loop lag in seconds',
  });

  // ─── Business Metrics ───────────────────────────────────────────────

  readonly ordersCreatedTotal = new Counter({
    name: 'orders_created_total',
    help: 'Total orders created',
    labelNames: ['channel', 'status'] as const, // channel: web/mobile/api, status: success/failed
  });

  readonly paymentProcessingDuration = new Histogram({
    name: 'payment_processing_duration_seconds',
    help: 'Payment processing duration in seconds',
    labelNames: ['provider'] as const, // provider: stripe/paypal/square
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10],
  });

  readonly activeUsersGauge = new Gauge({
    name: 'active_users',
    help: 'Number of currently active users',
  });

  readonly queueDepth = new Gauge({
    name: 'queue_depth',
    help: 'Number of pending items in queue',
    labelNames: ['queue_name'] as const, // queue_name: emails/reports/processing
  });

  // ─── Lifecycle ──────────────────────────────────────────────────────

  onModuleInit() {
    // Collect default Node.js metrics (GC, event loop, memory, etc.)
    collectDefaultMetrics({
      prefix: 'app_',
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
    });

    this.startEventLoopMonitoring();
  }

  onModuleDestroy() {
    this.stopEventLoopMonitoring();
  }

  // ─── Recording Methods ──────────────────────────────────────────────

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number
  ) {
    const durationSeconds = durationMs / 1000;

    this.httpRequestsTotal.inc({
      method,
      route,
      status_code: String(statusCode),
    });

    this.httpRequestDuration.observe(
      { method, route, status_code: String(statusCode) },
      durationSeconds
    );
  }

  recordDbQuery(operation: string, table: string, durationMs: number) {
    this.dbQueryDuration.observe(
      { operation, table },
      durationMs / 1000
    );
  }

  recordCacheAccess(cacheName: string, hit: boolean) {
    this.cacheHitsTotal.inc({
      cache_name: cacheName,
      result: hit ? 'hit' : 'miss',
    });
  }

  // ─── Event Loop Monitoring ──────────────────────────────────────────

  startEventLoopMonitoring() {
    // Timer-tick pattern: measure actual interval vs expected 100ms interval.
    // Any difference is event loop lag — time the event loop was blocked.
    this.eventLoopTimer = setInterval(() => {
      const now = process.hrtime.bigint();
      const elapsedMs = Number(now - this.lastTick) / 1e6;
      const lagSeconds = Math.max(0, (elapsedMs - 100) / 1000);
      this.eventLoopLagSeconds.set(lagSeconds);
      this.lastTick = now;
    }, 100);
  }

  stopEventLoopMonitoring() {
    if (this.eventLoopTimer) {
      clearInterval(this.eventLoopTimer);
      this.eventLoopTimer = null;
    }
  }
}
