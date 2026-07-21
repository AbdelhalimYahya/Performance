/**
 * STRUCTURED LOGGER — Trace-Aware Pino Logger
 *
 * Pino-based logger that automatically includes traceId and spanId
 * in every log line. This is the key pattern that makes logs searchable
 * by trace ID in Grafana Loki.
 *
 * Usage:
 *   logger.log({ userId: 123 }, 'User authenticated');
 *   logger.error({ error: err.message }, 'Request failed');
 *
 * Output (JSON):
 *   {"level":30,"traceId":"abc123","spanId":"def456","userId":123,"msg":"User authenticated"}
 */

import { Injectable, LoggerService } from '@nestjs/common';
import pino from 'pino';
import { TracingService } from './tracing.service';

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private readonly logger: pino.Logger;

  constructor(private readonly tracing: TracingService) {
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
      },
    });
  }

  /**
   * Log a message with optional context data.
   * Automatically injects traceId and spanId from the current request context.
   */
  log(message: string, context?: Record<string, any>) {
    this.logger.info(
      {
        ...context,
        traceId: this.tracing.getTraceId(),
        spanId: this.tracing.getSpanId(),
      },
      message
    );
  }

  /**
   * Log an error with full context.
   * Includes error object serialization via pino serializers.
   */
  error(message: string, error?: Error, context?: Record<string, any>) {
    this.logger.error(
      {
        ...context,
        err: error,
        traceId: this.tracing.getTraceId(),
        spanId: this.tracing.getSpanId(),
      },
      message
    );
  }

  /**
   * Log a warning.
   */
  warn(message: string, context?: Record<string, any>) {
    this.logger.warn(
      {
        ...context,
        traceId: this.tracing.getTraceId(),
        spanId: this.tracing.getSpanId(),
      },
      message
    );
  }

  /**
   * Log debug information (only in development).
   */
  debug(message: string, context?: Record<string, any>) {
    this.logger.debug(
      {
        ...context,
        traceId: this.tracing.getTraceId(),
        spanId: this.tracing.getSpanId(),
      },
      message
    );
  }

  /**
   * Get the underlying pino instance for advanced use cases.
   */
  getPinoLogger(): pino.Logger {
    return this.logger;
  }
}
