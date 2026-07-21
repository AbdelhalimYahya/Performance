/**
 * CPU PROFILER SERVICE — Production-Safe CPU Profiling
 *
 * Uses Node.js built-in inspector module to capture CPU profiles
 * without restarting the process. Profiles are written to /tmp
 * as .cpuprofile files for analysis in Chrome DevTools.
 *
 * Production-safe:
 * - Prevents concurrent profiling sessions
 * - Auto-profiled on configurable intervals
 * - Parses hot functions for quick summary without opening Chrome
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as inspector from 'inspector';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────

interface ProfileSummary {
  totalSamples: number;
  totalDuration: number;
  hotFunctions: Array<{
    name: string;
    selfTime: number;
    totalTime: number;
    selfPercent: number;
  }>;
}

// ─── Service ─────────────────────────────────────────────────────────────

@Injectable()
export class CpuProfilerService implements OnModuleDestroy {
  private readonly logger = new Logger(CpuProfilerService.name);
  private session: inspector.Session | null = null;
  private active = false;
  private lastProfilePath: string | null = null;
  private lastProfileAt: Date | null = null;
  private lastProfileLabel: string | null = null;
  private autoProfileTimer: ReturnType<typeof setInterval> | null = null;
  private profileDir: string;

  constructor() {
    this.profileDir = path.join('/tmp', 'cpuprofiles');
    this.ensureProfileDir();
  }

  onModuleDestroy() {
    this.stopAutoProfile();
    if (this.session) {
      this.session.disconnect();
    }
  }

  // ─── Start Profiling ───────────────────────────────────────────────

  async startProfiling(durationMs: number, label: string): Promise<string> {
    if (this.active) {
      throw new Error('A profiling session is already active');
    }

    this.active = true;
    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `cpuprof-${label}-${timestamp}.cpuprofile`;
    const filePath = path.join(this.profileDir, filename);

    this.logger.log(`Starting CPU profile: ${label} (${durationMs}ms)`);

    // Create a new inspector session
    this.session = new inspector.Session();
    this.session.connect();

    // Enable the profiler
    await new Promise<void>((resolve, reject) => {
      this.session!.post('Profiler.enable', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Start profiling
    await new Promise<void>((resolve, reject) => {
      this.session!.post('Profiler.start', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Wait for the specified duration
    await new Promise((resolve) => setTimeout(resolve, durationMs));

    // Stop profiling and get the result
    const profile = await new Promise<inspector.Profiler.Profile>((resolve, reject) => {
      this.session!.post('Profiler.stop', (err, result) => {
        if (err) reject(err);
        else resolve(result.profile);
      });
    });

    // Write profile to disk
    fs.writeFileSync(filePath, JSON.stringify(profile));

    // Disconnect the session
    this.session.disconnect();
    this.session = null;
    this.active = false;

    this.lastProfilePath = filePath;
    this.lastProfileAt = new Date();
    this.lastProfileLabel = label;

    const elapsed = Date.now() - startTime;
    this.logger.log(`CPU profile saved: ${filePath} (${elapsed}ms total)`);

    return filePath;
  }

  // ─── Status ────────────────────────────────────────────────────────

  isProfilerActive(): boolean {
    return this.active;
  }

  getStatus() {
    return {
      isActive: this.active,
      lastProfileAt: this.lastProfileAt?.toISOString() || null,
      lastProfileLabel: this.lastProfileLabel,
      lastProfilePath: this.lastProfilePath,
    };
  }

  // ─── Auto-Profiling ────────────────────────────────────────────────

  scheduleAutoProfile(intervalMs: number, durationMs: number) {
    this.stopAutoProfile();

    this.logger.log(
      `Auto-profiling enabled: every ${intervalMs / 1000}s for ${durationMs}ms`
    );

    this.autoProfileTimer = setInterval(async () => {
      try {
        if (!this.active) {
          await this.startProfiling(durationMs, 'auto');
        }
      } catch (err) {
        this.logger.error('Auto-profile failed', err);
      }
    }, intervalMs);
  }

  stopAutoProfile() {
    if (this.autoProfileTimer) {
      clearInterval(this.autoProfileTimer);
      this.autoProfileTimer = null;
    }
  }

  // ─── Profile Summary ───────────────────────────────────────────────

  getLastProfileSummary(): ProfileSummary | null {
    if (!this.lastProfilePath || !fs.existsSync(this.lastProfilePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(this.lastProfilePath, 'utf-8');
      const profile: inspector.Profiler.Profile = JSON.parse(raw);

      // Build function lookup from nodes
      const nodes = profile.nodes || [];
      const totalSamples = profile.nodes?.reduce(
        (sum, node) => sum + (node.hitCount || 0), 0
      ) || 0;

      const functionMap = new Map<string, { selfTime: number; totalTime: number }>();

      for (const node of nodes) {
        const name = node.callFrame?.functionName || node.callFrame?.url || 'anonymous';
        const hitCount = node.hitCount || 0;

        const existing = functionMap.get(name) || { selfTime: 0, totalTime: 0 };
        existing.selfTime += hitCount;
        existing.totalTime += hitCount;
        functionMap.set(name, existing);
      }

      // Sort by self-time (hot functions)
      const sorted = Array.from(functionMap.entries())
        .map(([name, times]) => ({
          name,
          selfTime: times.selfTime,
          totalTime: times.totalTime,
          selfPercent: totalSamples > 0 ? (times.selfTime / totalSamples) * 100 : 0,
        }))
        .sort((a, b) => b.selfTime - a.selfTime)
        .slice(0, 10);

      return {
        totalSamples,
        totalDuration: profile.endTime - profile.startTime,
        hotFunctions: sorted,
      };
    } catch (err) {
      this.logger.error('Failed to parse profile', err);
      return null;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private ensureProfileDir() {
    if (!fs.existsSync(this.profileDir)) {
      fs.mkdirSync(this.profileDir, { recursive: true });
    }
  }
}
