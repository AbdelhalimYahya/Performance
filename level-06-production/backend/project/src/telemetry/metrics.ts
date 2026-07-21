/**
 * METRICS — Prometheus Metrics Setup
 *
 * Initializes MeterProvider with PrometheusExporter on port 9464.
 * Exports standard application meters: HTTP request duration, total requests,
 * active connections, event loop lag, and heap usage.
 *
 * Prometheus scrapes /metrics endpoint — this is the exporter output.
 */

import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import {
  Counter,
  Histogram,
  Gauge,
  metrics,
} from '@opentelemetry/api';
import { appTracer } from './tracing';

// ─── Prometheus Exporter ─────────────────────────────────────────────────

const prometheusExporter = new PrometheusExporter({
  port: parseInt(process.env.OTEL_PROM_PORT || '9464', 10),
  appendTimestamp: true,
});

// ─── Meter Provider ──────────────────────────────────────────────────────

const meterProvider = new MeterProvider({
  readers: [prometheusExporter],
  // Register globally so meter instruments are accessible anywhere
});

metrics.setGlobalMeterProvider(meterProvider);
const meter = meterProvider.getMeter('app-metrics', '1.0.0');

// ─── HTTP Request Duration Histogram ─────────────────────────────────────

/**
 * Buckets are in seconds. Cover 5ms to 5s with fine granularity around
 * typical SLO thresholds (100ms, 250ms, 500ms).
 */
export const httpRequestDuration = meter.createHistogram('http_request_duration', {
  description: 'HTTP request duration in seconds',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  },
});

// ─── HTTP Request Total Counter ──────────────────────────────────────────

export const httpRequestTotal = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests',
});

// ─── Active Connections Gauge ────────────────────────────────────────────

let currentConnections = 0;

export const activeConnectionsGauge = meter.createObservableGauge('active_connections', {
  description: 'Number of active connections',
  observe: (gauge) => {
    gauge.observe(currentConnections);
  },
});

export function incrementConnections() {
  currentConnections++;
}

export function decrementConnections() {
  currentConnections = Math.max(0, currentConnections - 1);
}

// ─── Event Loop Lag Gauge ────────────────────────────────────────────────

let eventLoopLagMs = 0;

const eventLoopLagGauge = meter.createObservableGauge('event_loop_lag_ms', {
  description: 'Event loop lag in milliseconds',
  observe: (gauge) => {
    gauge.observe(eventLoopLagMs);
  },
});

// Timer-tick pattern: measure actual interval vs expected interval
let lastTick = process.hrtime.bigint();

setInterval(() => {
  const now = process.hrtime.bigint();
  const elapsedMs = Number(now - lastTick) / 1e6;
  // Expected interval is 100ms — any difference is event loop lag
  eventLoopLagMs = Math.max(0, elapsedMs - 100);
  lastTick = now;
}, 100);

// ─── Heap Usage Gauge ────────────────────────────────────────────────────

const heapUsedGauge = meter.createObservableGauge('process_heap_used_bytes', {
  description: 'Heap memory used in bytes',
  observe: (gauge) => {
    const mem = process.memoryUsage();
    gauge.observe(mem.heapUsed);
  },
});

// ─── Active Span Counter ─────────────────────────────────────────────────

let activeSpans = 0;

const activeSpansGauge = meter.createObservableGauge('active_spans', {
  description: 'Number of active OpenTelemetry spans',
  observe: (gauge) => {
    gauge.observe(activeSpans);
  },
});

export function incrementActiveSpans() {
  activeSpans++;
}

export function decrementActiveSpans() {
  activeSpans = Math.max(0, activeSpans - 1);
}

// ─── Connection Tracking (exported for use in interceptors) ──────────────

export { currentConnections };
