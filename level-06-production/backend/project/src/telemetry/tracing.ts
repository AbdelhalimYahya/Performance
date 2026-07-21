/**
 * TRACING — OpenTelemetry Initialization
 *
 * This file MUST be imported first in main.ts — before NestJS bootstrap.
 * Auto-instrumentations patch HTTP clients and servers at load time.
 * If you import Express or HTTP before OTel, the patches will not apply.
 *
 * Usage in main.ts:
 *   import './tracing';
 *   import { NestFactory } from '@nestjs/core';
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from '@opentelemetry/semantic-conventions';

// ─── Resource Attributes ─────────────────────────────────────────────────

const resource = new Resource({
  [ATTR_SERVICE_NAME]: 'perf-production-backend',
  [ATTR_SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
  [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV || 'development',
});

// ─── Trace Exporter ──────────────────────────────────────────────────────

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`
    : 'http://localhost:4317/v1/traces',
});

// ─── SDK Initialization ──────────────────────────────────────────────────

const sdk = new NodeSDK({
  resource,
  traceExporter,
  // BatchSpanProcessor buffers spans and exports in batches — much more
  // efficient than SimpleSpanProcessor which exports every span immediately.
  // Use BatchSpanProcessor in production to reduce network overhead.
  spanProcessor: new BatchSpanProcessor(traceExporter, {
    maxQueueSize: 2048,
    maxExportBatchSize: 512,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: 30000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Fine-tune auto-instrumentations
      '@opentelemetry/instrumentation-http': {
        // Ignore health check and metrics endpoints to reduce noise
        ignoreIncomingRequestHook: (req) => {
          const url = req.url || '';
          return url === '/health' || url === '/metrics';
        },
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-pg': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-ioredis': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-dns': {
        enabled: false, // DNS spans are noisy, disable unless needed
      },
    }),
  ],
});

// ─── Start SDK Synchronously ─────────────────────────────────────────────

// sdk.start() must be called before any other imports that use HTTP.
// It patches the HTTP module globally — once patched, unpatching is not safe.
sdk.start();

// ─── Graceful Shutdown ───────────────────────────────────────────────────

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('[OTel] Tracing terminated'))
    .catch((err) => console.error('[OTel] Shutdown error:', err))
    .finally(() => process.exit(0));
});

// ─── Exported Tracer ─────────────────────────────────────────────────────

/**
 * Use this tracer throughout the application for manual spans.
 * Example:
 *   import { appTracer } from './tracing';
 *   const span = appTracer.startSpan('my-operation');
 */
export const appTracer = trace.getTracer('app-tracer');

/**
 * Helper to run a function inside an active span.
 * The span is automatically closed when the function completes.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: any) => Promise<T>,
  attributes?: Record<string, string>
): Promise<T> {
  return appTracer.startActiveSpan(name, async (span) => {
    try {
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          span.setAttribute(key, value);
        }
      }
      const result = await fn(span);
      span.setStatus({ code: 0 }); // OK
      return result;
    } catch (error) {
      span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

export { context };
