// ============================================================================
// Next.js Instrumentation Hook
// ============================================================================
//
// This file runs once when the server starts (before any request is handled).
// It is enabled via experimental.instrumentationHook in next.config.js.
//
// Use cases:
// - Set up APM agents (Datadog, New Relic, etc.)
// - Initialize global error handlers
// - Register performance marks for startup measurement
// - Log server metadata for debugging
// ============================================================================

import type { Instrumentation } from 'next/server';

// ============================================================================
// Types
// ============================================================================

interface ServerStats {
  uptime: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  nodeVersion: string;
  nextVersion: string;
  environment: string;
  startedAt: string;
}

interface PerformanceContext {
  operation: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Startup Performance Marks
// ============================================================================

function registerStartupMarks(): void {
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark('next:instrumentation:start');
  }
}

function measureStartupDuration(): number {
  if (typeof performance !== 'undefined' && performance.mark && performance.measure) {
    performance.mark('next:instrumentation:end');
    performance.measure(
      'next:instrumentation:duration',
      'next:instrumentation:start',
      'next:instrumentation:end'
    );

    const entries = performance.getEntriesByName('next:instrumentation:duration');
    return entries.length > 0 ? entries[0].duration : 0;
  }
  return 0;
}

// ============================================================================
// Console Banner
// ============================================================================

function printServerBanner(startupDuration: number): void {
  const nextVersion = process.env.__NEXT_VERSION ?? 'unknown';
  const nodeVersion = process.version;
  const env = process.env.NODE_ENV ?? 'development';
  const timestamp = new Date().toISOString();

  const banner = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║                Performance Fundamentals Server              ║',
    '╠══════════════════════════════════════════════════════════════╣',
    `║  Started at:    ${timestamp.padEnd(42)}║`,
    `║  Node.js:       ${nodeVersion.padEnd(42)}║`,
    `║  Next.js:       ${nextVersion.padEnd(42)}║`,
    `║  Environment:   ${env.padEnd(42)}║`,
    `║  Startup time:  ${startupDuration.toFixed(2).padEnd(39)}ms║`,
    '╚══════════════════════════════════════════════════════════════╝',
    '',
  ];

  console.log(banner.join('\n'));
}

// ============================================================================
// Global Error Handler
// ============================================================================

function setupGlobalErrorHandlers(): void {
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    const context: PerformanceContext = {
      operation: 'unhandledRejection',
      metadata: {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        uptime: process.uptime(),
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1048576),
        timestamp: new Date().toISOString(),
      },
    };

    console.error('[Instrumentation] Unhandled Rejection:', JSON.stringify(context, null, 2));
  });

  process.on('uncaughtException', (error: Error) => {
    const context: PerformanceContext = {
      operation: 'uncaughtException',
      duration: undefined,
      metadata: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        uptime: process.uptime(),
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1048576),
        timestamp: new Date().toISOString(),
      },
    };

    console.error('[Instrumentation] Uncaught Exception:', JSON.stringify(context, null, 2));
  });
}

// ============================================================================
// Server Stats Export
// ============================================================================

/**
 * Returns current server statistics including uptime, memory usage,
 * and environment information.
 *
 * @returns ServerStats object with current server state
 *
 * @example
 * ```typescript
 * import { getServerStats } from '../instrumentation';
 * const stats = getServerStats();
 * console.log(`Server uptime: ${stats.uptime}s`);
 * ```
 */
export function getServerStats(): ServerStats {
  const mem = process.memoryUsage();
  return {
    uptime: process.uptime(),
    memoryUsage: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
    },
    nodeVersion: process.version,
    nextVersion: process.env.__NEXT_VERSION ?? 'unknown',
    environment: process.env.NODE_ENV ?? 'development',
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  };
}

// ============================================================================
// Instrumentation Hook
// ============================================================================

export const instrumentation: Instrumentation = {
  register() {
    // This runs once when the server module is loaded
    registerStartupMarks();
  },
};

// ============================================================================
// Server Initialization (runs after register)
// ============================================================================

function initializeServer(): void {
  const startupDuration = measureStartupDuration();
  printServerBanner(startupDuration);
  setupGlobalErrorHandlers();

  // Log initial memory baseline
  const mem = process.memoryUsage();
  console.log('[Instrumentation] Memory baseline:', {
    heapUsed: `${(mem.heapUsed / 1048576).toFixed(1)} MB`,
    heapTotal: `${(mem.heapTotal / 1048576).toFixed(1)} MB`,
    rss: `${(mem.rss / 1048576).toFixed(1)} MB`,
  });

  // Set up periodic memory monitoring (every 60 seconds)
  setInterval(() => {
    const current = process.memoryUsage();
    const heapPct = (current.heapUsed / current.heapTotal) * 100;

    if (heapPct > 80) {
      console.warn('[Instrumentation] High memory usage:', {
        heapUsed: `${(current.heapUsed / 1048576).toFixed(1)} MB`,
        heapTotal: `${(current.heapTotal / 1048576).toFixed(1)} MB`,
        percentage: `${heapPct.toFixed(1)}%`,
      });
    }
  }, 60_000);
}

// Run initialization
initializeServer();
