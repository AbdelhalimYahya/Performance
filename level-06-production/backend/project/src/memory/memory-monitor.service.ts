/**
 * MEMORY MONITOR SERVICE — Automated Leak Detection
 *
 * Collects memory snapshots every 60 seconds via @Cron.
 * Analyzes trend using linear regression to detect memory leaks.
 * Maintains a circular buffer of last 60 snapshots (1 hour).
 *
 * Alert thresholds:
 * - heapUsedPercent > 85% → WARN
 * - heapUsedPercent > 95% → ERROR (optionally trigger restart)
 * - Linear regression slope > 1MB/min over 30 snapshots → LEAK
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HeapSnapshotService } from './heap-snapshot.service';

// ─── Types ───────────────────────────────────────────────────────────────

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
  heapUsedPercent: number;
}

export interface LeakAnalysis {
  detected: boolean;
  slopeBytesPerMin: number;
  snapshotsAnalyzed: number;
  trendDescription: string;
}

// ─── Service ─────────────────────────────────────────────────────────────

@Injectable()
export class MemoryMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MemoryMonitorService.name);
  private readonly buffer: MemorySnapshot[] = [];
  private readonly BUFFER_SIZE = 60; // 60 snapshots × 60s = 1 hour
  private leakLogged = false;

  constructor(private readonly heapSnapshot: HeapSnapshotService) {}

  onModuleInit() {
    this.logger.log('Memory monitor initialized — collecting snapshots every 60s');
  }

  onModuleDestroy() {
    this.logger.log('Memory monitor stopped');
  }

  // ─── Cron: Collect Snapshot Every 60 Seconds ───────────────────────

  @Cron(CronExpression.EVERY_10_SECONDS)
  collectSnapshot() {
    const mem = process.memoryUsage();
    const heapUsedPercent = (mem.heapUsed / mem.heapTotal) * 100;

    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      rss: mem.rss,
      heapUsedPercent,
    };

    // Circular buffer — overwrite oldest when full
    if (this.buffer.length >= this.BUFFER_SIZE) {
      this.buffer.shift();
    }
    this.buffer.push(snapshot);

    // Check thresholds
    if (heapUsedPercent > 95) {
      this.logger.error(
        `CRITICAL: Heap usage at ${heapUsedPercent.toFixed(1)}% — ${this.formatBytes(mem.heapUsed)} / ${this.formatBytes(mem.heapTotal)}`
      );
      this.triggerHeapSnapshot('critical-heap-usage');
    } else if (heapUsedPercent > 85) {
      this.logger.warn(
        `WARNING: Heap usage at ${heapUsedPercent.toFixed(1)}% — ${this.formatBytes(mem.heapUsed)} / ${this.formatBytes(mem.heapTotal)}`
      );
    }

    // Analyze for leak trend (need at least 30 snapshots)
    if (this.buffer.length >= 30) {
      const analysis = this.detectLeak();
      if (analysis.detected && !this.leakLogged) {
        this.logger.error(
          `MEMORY LEAK DETECTED: Growing at ${this.formatBytes(analysis.slopeBytesPerMin)}/min ` +
          `over ${analysis.snapshotsAnalyzed} snapshots. ` +
          `Estimated leak rate: ${this.formatBytes(analysis.slopeBytesPerMin * 60)}/hour`
        );
        this.triggerHeapSnapshot('leak-detection');
        this.leakLogged = true;
      } else if (!analysis.detected) {
        this.leakLogged = false;
      }
    }
  }

  // ─── Leak Detection via Linear Regression ──────────────────────────

  detectLeak(): LeakAnalysis {
    // Use last 30 snapshots for trend analysis
    const samples = this.buffer.slice(-30);
    const n = samples.length;

    if (n < 10) {
      return {
        detected: false,
        slopeBytesPerMin: 0,
        snapshotsAnalyzed: n,
        trendDescription: 'Insufficient data',
      };
    }

    // Simple linear regression: y = mx + b
    // x = time (minutes from first sample), y = heapUsed (bytes)
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const firstTimestamp = samples[0].timestamp;

    for (let i = 0; i < n; i++) {
      const x = (samples[i].timestamp - firstTimestamp) / 60000; // minutes
      const y = samples[i].heapUsed;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Leak detected if slope > 1MB/min (growing consistently)
    const SLOPE_THRESHOLD = 1 * 1024 * 1024; // 1MB/min
    const detected = slope > SLOPE_THRESHOLD;

    return {
      detected,
      slopeBytesPerMin: slope,
      snapshotsAnalyzed: n,
      trendDescription: detected
        ? `Growing at ${this.formatBytes(slope)}/min`
        : 'Stable or declining',
    };
  }

  // ─── Public Accessors ──────────────────────────────────────────────

  getSnapshots(): MemorySnapshot[] {
    return [...this.buffer];
  }

  getCurrentMemory() {
    const mem = process.memoryUsage();
    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      rss: mem.rss,
      heapUsedPercent: (mem.heapUsed / mem.heapTotal) * 100,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private async triggerHeapSnapshot(reason: string) {
    try {
      const path = await this.heapSnapshot.takeSnapshot(reason);
      this.logger.log(`Heap snapshot saved: ${path}`);
    } catch (err) {
      this.logger.error('Failed to take heap snapshot', err);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} B`;
  }
}
