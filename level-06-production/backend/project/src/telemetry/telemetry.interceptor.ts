/**
 * TELEMETRY INTERCEPTOR — Automatic HTTP Request Instrumentation
 *
 * NestJS interceptor that:
 * 1. Creates an OpenTelemetry span for every HTTP request
 * 2. Records request duration in the histogram
 * 3. Increments the request counter
 * 4. Handles errors by recording exceptions on the span
 *
 * Span name uses route pattern (not URL) to avoid high cardinality:
 *   ✅ "GET /users/:id" (route pattern)
 *   ❌ "GET /users/12345" (URL with high cardinality)
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { SpanStatusCode } from '@opentelemetry/api';
import { appTracer } from './tracing';
import {
  httpRequestDuration,
  httpRequestTotal,
  incrementActiveSpans,
  decrementActiveSpans,
} from './metrics';

@Injectable()
export class TelemetryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Extract route pattern — falls back to path if route is not yet resolved
    const route = request.route?.path || request.path;
    const method = request.method;
    const spanName = `HTTP ${method} ${route}`;

    return appTracer.startActiveSpan(spanName, (span) => {
      incrementActiveSpans();

      // Set standard HTTP attributes on the span
      span.setAttribute('http.method', method);
      span.setAttribute('http.route', route);
      span.setAttribute('http.url', request.url);
      span.setAttribute('http.user_agent', request.headers['user-agent'] || 'unknown');
      span.setAttribute('http.request_content_length', request.headers['content-length'] || 0);

      const startTime = process.hrtime.bigint();

      return next.handle().pipe(
        // Success: record duration and status
        tap(() => {
          const duration = this.getDurationSeconds(startTime);
          const statusCode = response.statusCode;

          span.setAttribute('http.status_code', statusCode);
          span.setStatus({ code: SpanStatusCode.OK });

          // Record metrics
          httpRequestDuration.record(duration, {
            method,
            route,
            status_code: String(statusCode),
          });

          httpRequestTotal.add(1, {
            method,
            route,
            status_code: String(statusCode),
          });

          span.end();
          decrementActiveSpans();
        }),

        // Error: record exception and set error status
        catchError((error) => {
          const duration = this.getDurationSeconds(startTime);
          const statusCode = error.status || error.statusCode || 500;

          span.setAttribute('http.status_code', statusCode);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          span.recordException(error);

          httpRequestDuration.record(duration, {
            method,
            route,
            status_code: String(statusCode),
          });

          httpRequestTotal.add(1, {
            method,
            route,
            status_code: String(statusCode),
          });

          span.end();
          decrementActiveSpans();

          throw error; // Re-throw so NestJS handles the response
        })
      );
    });
  }

  private getDurationSeconds(startTime: bigint): number {
    const elapsed = process.hrtime.bigint() - startTime;
    return Number(elapsed) / 1e9; // nanoseconds to seconds
  }
}
