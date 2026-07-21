/**
 * TRACING SERVICE — Span Management Utilities
 *
 * Provides methods to interact with the current active span:
 * - getCurrentSpan(): get the active span from AsyncLocalStorage
 * - getTraceId(): get current trace ID for log correlation
 * - withSpan(): create child spans with automatic error handling
 * - addSpanAttribute(): add attributes to the current span
 * - recordSpanException(): record errors on the current span
 */

import { Injectable } from '@nestjs/common';
import { trace, Span, SpanStatusCode, SpanAttributeValue } from '@opentelemetry/api';
import { requestStorage } from './trace-context.middleware';

@Injectable()
export class TracingService {
  private readonly tracer = trace.getTracer('app-service');

  /**
   * Returns the active span from the current request context.
   * Returns null if called outside of a request context.
   */
  getCurrentSpan(): Span | null {
    const ctx = requestStorage.getStore();
    return ctx?.span || null;
  }

  /**
   * Returns the current trace ID string for including in log lines.
   * Returns 'no-trace' if called outside of a request context.
   */
  getTraceId(): string {
    const ctx = requestStorage.getStore();
    return ctx?.traceId || 'no-trace';
  }

  /**
   * Returns the current span ID string.
   */
  getSpanId(): string {
    const ctx = requestStorage.getStore();
    return ctx?.spanId || 'no-span';
  }

  /**
   * Creates a child span, runs the provided function, and ends the span
   * automatically — even if the function throws an error.
   *
   * Usage:
   *   const result = await tracingService.withSpan('fetch-user', async (span) => {
   *     span.setAttribute('user.id', userId);
   *     return await userService.findById(userId);
   *   });
   */
  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    attributes?: Record<string, SpanAttributeValue>
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, async (span) => {
      try {
        if (attributes) {
          for (const [key, value] of Object.entries(attributes)) {
            span.setAttribute(key, value);
          }
        }

        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Adds an attribute to the current active span.
   * Useful for enriching spans with business context (e.g., user ID, order ID).
   */
  addSpanAttribute(key: string, value: SpanAttributeValue): void {
    const span = this.getCurrentSpan();
    if (span) {
      span.setAttribute(key, value);
    }
  }

  /**
   * Records an error on the current span and sets error status.
   * Call this in catch blocks to ensure the span reflects the error.
   */
  recordSpanException(error: Error): void {
    const span = this.getCurrentSpan();
    if (span) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    }
  }
}
