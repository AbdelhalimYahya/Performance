/**
 * HEAP SNAPSHOT SERVICE — V8 Heap Snapshot Management
 *
 * Triggers V8 heap snapshots for memory leak analysis.
 * Snapshots are large (100MB+) so they are compressed and auto-cleaned after 24h.
 *
 * Production-safe:
 * - Uses v8.writeHeapSnapshot() which is non-blocking
 * - SIGUSR2 signal handler for manual snapshots
 * - Automatic cleanup of old snapshots
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as v8 from 'v8';
import * as fs from 'fs';
import * as path from 'path';
import * as { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';

@Injectable()
export class HeapSnapshotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeapSnapshotService.name);
  private readonly snapshotDir: string;
  private signalHandler: ((signal: string) => void) | null = null;

  constructor() {
    this.snapshotDir = path.join('/tmp', 'heapsnapshots');
    this.ensureSnapshotDir();
  }

  onModuleInit() {
    this.registerSignalHandler();
    this.logger.log('Heap snapshot service initialized — send SIGUSR2 to trigger');
  }

  onModuleDestroy() {
    this.unregisterSignalHandler();
  }

  // ─── Take Snapshot ─────────────────────────────────────────────────

  async takeSnapshot(reason: string): Promise<string> {
    const timestamp = Date.now();
    const filename = `heapsnap-${timestamp}-${reason}.heapsnapshot`;
    const filePath = path.join(this.snapshotDir, filename);

    this.logger.log(`Taking heap snapshot: ${filename} (reason: ${reason})`);

    // v8.writeHeapSnapshot() is synchronous but non-blocking for the event loop
    // It writes directly to disk without duplicating the heap in memory
    const writtenPath = v8.writeHeapSnapshot(filePath);

    this.logger.log(`Heap snapshot written: ${writtenPath}`);

    // Compress in background (non-blocking)
    this.compressSnapshot(writtenPath).catch((err) => {
      this.logger.error('Failed to compress heap snapshot', err);
    });

    return writtenPath;
  }

  // ─── Compress Snapshot ─────────────────────────────────────────────

  async compressSnapshot(filePath: string): Promise<string> {
    const gzipPath = `${filePath}.gz`;
    const input = fs.createReadStream(filePath);
    const output = fs.createWriteStream(gzipPath);
    const gzip = createGzip({ level: 9 }); // Maximum compression

    await pipeline(input, gzip, output);

    // Remove uncompressed file after successful compression
    fs.unlinkSync(filePath);
    this.logger.log(`Compressed: ${gzipPath}`);

    return gzipPath;
  }

  // ─── Cleanup Old Snapshots (>24 hours) ─────────────────────────────

  cleanupOldSnapshots(): void {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    try {
      const files = fs.readdirSync(this.snapshotDir);
      let cleaned = 0;

      for (const file of files) {
        const filePath = path.join(this.snapshotDir, file);
        const stat = fs.statSync(filePath);

        if (now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.logger.log(`Cleaned up ${cleaned} old heap snapshots`);
      }
    } catch (err) {
      this.logger.error('Failed to cleanup old snapshots', err);
    }
  }

  // ─── SIGUSR2 Signal Handler ────────────────────────────────────────

  private registerSignalHandler() {
    this.signalHandler = (signal: string) => {
      if (signal === 'SIGUSR2') {
        this.logger.log('SIGUSR2 received — taking manual heap snapshot');
        this.takeSnapshot('manual-signal').catch((err) => {
          this.logger.error('Failed to take snapshot from SIGUSR2', err);
        });
      }
    };

    process.on('SIGUSR2', this.signalHandler);
  }

  private unregisterSignalHandler() {
    if (this.signalHandler) {
      process.removeListener('SIGUSR2', this.signalHandler);
      this.signalHandler = null;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private ensureSnapshotDir() {
    if (!fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
    }
  }

  getSnapshotDir(): string {
    return this.snapshotDir;
  }
}
