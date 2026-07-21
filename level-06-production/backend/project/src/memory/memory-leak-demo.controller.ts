/**
 * MEMORY LEAK DEMO CONTROLLER — Testing & Demonstration
 *
 * ⚠️  DEMO ONLY — This controller is for testing memory leak detection.
 * Do NOT deploy to production. Clearly labeled for development use.
 *
 * Endpoints:
 *   GET /memory/leak/start  — starts a controllable memory leak
 *   GET /memory/leak/stop   — stops the leak
 *   GET /memory/leak/status — returns memory stats + leak analysis
 *   GET /memory/leak/snapshot — triggers manual heap snapshot
 *   GET /memory/stats       — returns last 60 snapshots as time-series
 *   GET /memory/gc          — forces garbage collection (requires --expose-gc)
 */

import { Controller, Get, Logger } from '@nestjs/common';
import { MemoryMonitorService } from './memory-monitor.service';
import { HeapSnapshotService } from './heap-snapshot.service';

@Controller('memory')
export class MemoryLeakDemoController {
  private readonly logger = new Logger(MemoryLeakDemoController.name);
  private leakInterval: ReturnType<typeof setInterval> | null = null;
  private leakArray: any[] = [];

  constructor(
    private readonly monitor: MemoryMonitorService,
    private readonly heapSnapshot: HeapSnapshotService
  ) {}

  // ─── Leak Control ──────────────────────────────────────────────────

  @Get('leak/start')
  startLeak() {
    if (this.leakInterval) {
      return { status: 'already running' };
    }

    this.logger.warn('MEMORY LEAK STARTED — this is a demo endpoint');
    let count = 0;

    this.leakInterval = setInterval(() => {
      // Allocate ~100KB every 100ms — grows without bound
      const chunk = Buffer.alloc(100 * 1024);
      this.leakArray.push({ data: chunk, id: count++, timestamp: Date.now() });
    }, 100);

    return {
      status: 'leak started',
      warning: 'This endpoint is for testing only. Stop with /memory/leak/stop',
      allocationRate: '~100KB every 100ms (~1MB/s)',
    };
  }

  @Get('leak/stop')
  stopLeak() {
    if (!this.leakInterval) {
      return { status: 'not running' };
    }

    clearInterval(this.leakInterval);
    this.leakInterval = null;

    const leakedObjects = this.leakArray.length;
    const leakedBytes = this.leakArray.length * 100 * 1024;

    // Note: we cannot free this array from here — it would need to be
    // assigned to null and GC'd. The heap snapshot shows the retained objects.
    return {
      status: 'leak stopped',
      leakedObjects,
      leakedBytes: `${(leakedBytes / (1024 * 1024)).toFixed(1)} MB`,
      note: 'Array still in memory — run /memory/gc after clearing it',
    };
  }

  @Get('leak/status')
  getLeakStatus() {
    const current = this.monitor.getCurrentMemory();
    const analysis = this.monitor.detectLeak();

    return {
      memory: current,
      leakAnalysis: analysis,
      leakRunning: this.leakInterval !== null,
      leakedObjects: this.leakArray.length,
    };
  }

  @Get('leak/snapshot')
  async takeSnapshot() {
    const path = await this.heapSnapshot.takeSnapshot('manual-demo');
    return { path, message: 'Heap snapshot saved. Download and open in Chrome DevTools.' };
  }

  // ─── Memory Stats ──────────────────────────────────────────────────

  @Get('stats')
  getStats() {
    return {
      current: this.monitor.getCurrentMemory(),
      snapshots: this.monitor.getSnapshots(),
      leakAnalysis: this.monitor.detectLeak(),
    };
  }

  @Get('gc')
  forceGC() {
    const before = process.memoryUsage();

    if (typeof global.gc === 'function') {
      global.gc();
      const after = process.memoryUsage();

      return {
        status: 'gc executed',
        before: {
          heapUsed: `${(before.heapUsed / (1024 * 1024)).toFixed(1)} MB`,
          rss: `${(before.rss / (1024 * 1024)).toFixed(1)} MB`,
        },
        after: {
          heapUsed: `${(after.heapUsed / (1024 * 1024)).toFixed(1)} MB`,
          rss: `${(after.rss / (1024 * 1024)).toFixed(1)} MB`,
        },
        freed: `${((before.heapUsed - after.heapUsed) / (1024 * 1024)).toFixed(1)} MB`,
      };
    }

    return {
      status: 'gc not available',
      message: 'Start Node.js with --expose-gc flag to enable forced garbage collection',
      current: {
        heapUsed: `${(before.heapUsed / (1024 * 1024)).toFixed(1)} MB`,
        rss: `${(before.rss / (1024 * 1024)).toFixed(1)} MB`,
      },
    };
  }
}
