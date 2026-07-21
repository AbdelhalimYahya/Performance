/**
 * TELEMETRY MODULE — Global NestJS Module
 *
 * Registers TelemetryInterceptor as APP_INTERCEPTOR so it
 * automatically instruments every HTTP request.
 *
 * Provides a TRACER injection token for use in services that
 * need to create manual spans.
 */

import { Module, Global, Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Tracer } from '@opentelemetry/api';
import { TelemetryInterceptor } from './telemetry.interceptor';
import { appTracer } from './tracing';

// ─── Injection Token ─────────────────────────────────────────────────────

export const TRACER = 'TRACER';

// ─── Provider ────────────────────────────────────────────────────────────

const tracerProvider: Provider = {
  provide: TRACER,
  useValue: appTracer,
};

// ─── Module ──────────────────────────────────────────────────────────────

@Global()
@Module({
  providers: [
    tracerProvider,
    {
      provide: APP_INTERCEPTOR,
      useClass: TelemetryInterceptor,
    },
  ],
  exports: [TRACER],
})
export class TelemetryModule {}

// Re-export types for convenience
export { TelemetryInterceptor } from './telemetry.interceptor';
export { appTracer } from './tracing';
