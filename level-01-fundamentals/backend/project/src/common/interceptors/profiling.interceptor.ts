import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

// ============================================================================
// Types
// ============================================================================

export interface RequestProfile {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  memoryDelta: number;
  timestamp: number;
}

export interface ProfilingStats {
  totalRequests: number;
  slowRequests: number;
  averageDuration: number;
  p95Duration: number;
  p99Duration: number;
}

// ============================================================================
// Circular Buffer for Response Times
// ============================================================================

const BUFFER_SIZE = 1000;

class CircularBuffer {
  private buffer: number[] = new Array(BUFFER_SIZE);
  private head = 0;
  private count = 0;

  push(value: number): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % BUFFER_SIZE;
    if (this.count < BUFFER_SIZE) this.count++;
  }

  getAll(): number[] {
    if (this.count < BUFFER_SIZE) {
      return this.buffer.slice(0, this.count);
    }
    return [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head),
    ];
  }

  get length(): number {
    return this.count;
  }
}

// ============================================================================
// Percentile Calculation
// ============================================================================

/**
 * Calculates the p-th percentile of an array of numbers.
 * Sorts a copy of the array to avoid mutating the original.
 */
function calculatePercentile(times: number[], p: number): number {
  if (times.length === 0) return 0;
  const sorted = [...times].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// ============================================================================
// Profiling Interceptor
// ============================================================================

@Injectable()
export class ProfilingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('ProfilingInterceptor');
  private readonly durationBuffer = new CircularBuffer();
  private totalRequests = 0;
  private slowRequests = 0;

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const requestId = randomUUID();
    const startTime = process.hrtime.bigint();
    const memoryBefore = process.memoryUsage().heapUsed;

    // Attach request metadata to headers for downstream use
    response.setHeader('X-Request-Id', requestId);

    return next.handle().pipe(
      tap({
        next: () => {
          const endTime = process.hrtime.bigint();
          const duration = Number(endTime - startTime) / 1_000_000;
          const memoryAfter = process.memoryUsage().heapUsed;
          const memoryDelta = memoryAfter - memoryBefore;

          // Record duration in circular buffer for percentile calculation
          this.durationBuffer.push(duration);
          this.totalRequests++;

          // Set response headers
          response.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
          response.setHeader(
            'Server-Timing',
            [
              `total;dur=${duration.toFixed(2)}`,
              `memory;desc=delta;dur=${(memoryDelta / 1024).toFixed(1)}`,
            ].join(', ')
          );

          // Structured JSON log for every request
          const logEntry = {
            requestId,
            method: request.method,
            path: request.url,
            statusCode: response.statusCode,
            duration: parseFloat(duration.toFixed(2)),
            memoryDelta,
            timestamp: Date.now(),
          };

          // Slow request detection
          if (duration > 2000) {
            this.slowRequests++;
            this.logger.error(
              { ...logEntry, userAgent: request.headers['user-agent'] },
              'Very slow request (> 2000ms)'
            );
          } else if (duration > 500) {
            this.logger.warn(
              { ...logEntry, userAgent: request.headers['user-agent'] },
              'Slow request (> 500ms)'
            );
          } else {
            this.logger.debug(logEntry, 'Request completed');
          }
        },
        error: () => {
          // On error, still log timing
          const endTime = process.hrtime.bigint();
          const duration = Number(endTime - startTime) / 1_000_000;
          this.durationBuffer.push(duration);
          this.totalRequests++;
        },
      })
    );
  }

  /**
   * Returns profiling statistics computed from the circular buffer.
   */
  getStats(): ProfilingStats {
    const durations = this.durationBuffer.getAll();
    return {
      totalRequests: this.totalRequests,
      slowRequests: this.slowRequests,
      averageDuration:
        durations.length > 0
          ? parseFloat(
              (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)
            )
          : 0,
      p95Duration: parseFloat(calculatePercentile(durations, 95).toFixed(2)),
      p99Duration: parseFloat(calculatePercentile(durations, 99).toFixed(2)),
    };
  }
}
