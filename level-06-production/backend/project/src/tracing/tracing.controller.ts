/**
 * TRACING DEMO CONTROLLER — Multi-Span Trace Demonstration
 *
 * GET /tracing/demo — demonstrates a trace spanning 3 "services":
 *   1. Parent span: handle-demo-request
 *   2. Child span: fetch-user (simulated HTTP call)
 *   3. Child span: fetch-orders (simulated HTTP call)
 *   4. Child span: aggregate-data (CPU work combining results)
 *
 * Returns trace metadata and Jaeger URL for visualization.
 */

import { Controller, Get } from '@nestjs/common';
import { TracingService } from './tracing.service';
import { HttpClientService } from './http-client.service';

@Controller('tracing')
export class TracingController {
  constructor(
    private readonly tracing: TracingService,
    private readonly httpClient: HttpClientService
  ) {}

  @Get('demo')
  async getDemo() {
    const startTime = Date.now();
    let spanCount = 0;

    // ─── Parent Span: handle-demo-request ───────────────────────────
    const result = await this.tracing.withSpan(
      'handle-demo-request',
      async (parentSpan) => {
        spanCount = 1;

        // Add business context to the parent span
        this.tracing.addSpanAttribute('demo.type', 'multi-service-trace');

        // ─── Child Span 1: fetch-user ─────────────────────────────
        const user = await this.tracing.withSpan(
          'fetch-user',
          async (span) => {
            spanCount++;
            span.setAttribute('user.id', 'user-123');

            // Simulate HTTP call to user service
            // In production, this would be a real HTTP call with trace propagation
            await this.simulateWork(30, 'user-service');
            return { id: 'user-123', name: 'Alice Johnson', email: 'alice@example.com' };
          },
          { 'peer.service': 'user-service' }
        );

        // ─── Child Span 2: fetch-orders ───────────────────────────
        const orders = await this.tracing.withSpan(
          'fetch-orders',
          async (span) => {
            spanCount++;
            span.setAttribute('user.id', user.id);

            // Simulate HTTP call to orders service
            await this.simulateWork(50, 'orders-service');
            return [
              { id: 'order-001', total: 99.99, status: 'shipped' },
              { id: 'order-002', total: 149.50, status: 'processing' },
            ];
          },
          { 'peer.service': 'orders-service' }
        );

        // ─── Child Span 3: aggregate-data ─────────────────────────
        const aggregated = await this.tracing.withSpan(
          'aggregate-data',
          async (span) => {
            spanCount++;
            span.setAttribute('orders.count', orders.length);

            // Simulate CPU-intensive aggregation work
            await this.simulateWork(20, 'aggregation');
            return {
              user,
              orders,
              totalSpent: orders.reduce((sum, o) => sum + o.total, 0),
              orderCount: orders.length,
            };
          }
        );

        return aggregated;
      }
    );

    const totalDurationMs = Date.now() - startTime;
    const traceId = this.tracing.getTraceId();

    return {
      traceId,
      spanCount,
      totalDurationMs,
      jaegerUrl: `http://localhost:16686/trace/${traceId}`,
      data: result,
    };
  }

  /**
   * Simulates work with a delay. In production, replace with real HTTP calls.
   */
  private simulateWork(ms: number, serviceName: string): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(), ms);
    });
  }
}
