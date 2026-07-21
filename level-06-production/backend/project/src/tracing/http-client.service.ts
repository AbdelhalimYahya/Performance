/**
 * HTTP CLIENT SERVICE — Trace-Aware Outbound Requests
 *
 * Wrapper around fetch that automatically propagates W3C trace context
 * as outgoing headers. Creates child spans for each outbound request
 * with standard HTTP attributes.
 *
 * This ensures traces are continuous across service boundaries.
 */

import { Injectable } from '@nestjs/common';
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { requestStorage } from './trace-context.middleware';

@Injectable()
export class HttpClientService {
  private readonly tracer = trace.getTracer('http-client');

  /**
   * GET request with trace context propagation.
   * Creates a child span and injects the W3C traceparent header.
   */
  async get<T>(url: string, options?: RequestInit): Promise<T> {
    return this.request<T>('GET', url, undefined, options);
  }

  /**
   * POST request with trace context propagation.
   */
  async post<T>(url: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>('POST', url, body, options);
  }

  /**
   * Internal request method that handles span creation and header injection.
   */
  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<T> {
    // Parse URL to extract host for peer.service attribute
    const parsedUrl = new URL(url);
    const peerService = parsedUrl.hostname;

    return this.tracer.startActiveSpan(
      `HTTP ${method} ${peerService}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'http.url': url,
          'http.method': method,
          'peer.service': peerService,
        },
      },
      async (span) => {
        try {
          // Build headers with W3C traceparent
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options?.headers as Record<string, string> || {}),
          };

          // Inject trace context into outgoing headers
          const ctx = requestStorage.getStore();
          if (ctx?.span) {
            const traceHeaders = this.tracer.inject(
              ctx.span.spanContext(),
              {} as any,
              {}
            );
            Object.assign(headers, traceHeaders);
          }

          // Execute the request
          const response = await fetch(url, {
            method,
            body: body ? JSON.stringify(body) : undefined,
            headers,
            ...options,
          });

          span.setAttribute('http.status_code', response.status);

          if (!response.ok) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${response.status} ${response.statusText}`,
            });
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json() as T;
          span.setStatus({ code: SpanStatusCode.OK });
          return data;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }
}
