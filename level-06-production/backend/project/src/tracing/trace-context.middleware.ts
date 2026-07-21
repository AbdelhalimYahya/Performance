/**
 * TRACE CONTEXT MIDDLEWARE — W3C Trace Context Propagation
 *
 * Extracts trace context from incoming request headers (traceparent, tracestate)
 * per the W3C Trace Context standard. Creates a root span for the request and
 * stores it in AsyncLocalStorage for access throughout the request lifecycle.
 *
 * Injects trace-id and span-id into response headers for client-side correlation.
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { context, trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { AsyncLocalStorage } from 'async_hooks';
import { SpanStorage } from './tracing.service';

// ─── AsyncLocalStorage for Request-Scoped Span Access ────────────────────

export const requestStorage = new AsyncLocalStorage<RequestSpanContext>();

interface RequestSpanContext {
  span: any;
  traceId: string;
  spanId: string;
}

@Injectable()
export class TraceContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const tracer = trace.getTracer('http-server');

    // Extract trace context from incoming headers
    const parentContext = trace.contextFromHttpHeaders(req.headers);

    // Create root span for this request
    const span = tracer.startSpan(
      `${req.method} ${req.path}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': req.method,
          'http.url': req.originalUrl,
          'http.path': req.path,
          'http.host': req.headers.host || 'unknown',
          'http.user_agent': req.headers['user-agent'] || 'unknown',
        },
      },
      parentContext
    );

    const spanContext = span.spanContext();
    const traceId = spanContext.traceId;
    const spanId = spanContext.spanId;

    // Inject trace-id and span-id into response headers
    res.setHeader('X-Trace-Id', traceId);
    res.setHeader('X-Span-Id', spanId);

    // Store span in AsyncLocalStorage for child spans and logging
    const requestContext: RequestSpanContext = { span, traceId, spanId };

    // On response finish: set span status and end
    res.on('finish', () => {
      span.setAttribute('http.status_code', res.statusCode);

      if (res.statusCode >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${res.statusCode}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      span.end();
    });

    // Run the rest of the request inside AsyncLocalStorage context
    requestStorage.run(requestContext, () => {
      next();
    });
  }
}
