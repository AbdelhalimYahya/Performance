/**
 * invalidation-audit.service.ts — Circular buffer audit trail
 *
 * Stores the last 1000 invalidation events in memory for debugging
 * and monitoring. Provides aggregate stats for dashboards.
 */

import { Injectable } from '@nestjs/common';

// ============================================================================
// Types
// ============================================================================

export interface InvalidationRecord {
  timestamp: string;
  eventType: string;
  keysAffected: number;
  duration: number;
  correlationId: string;
}

export interface InvalidationStats {
  totalInvalidations: number;
  byEventType: Record<string, number>;
  avgKeysPerInvalidation: number;
  peakInvalidationsPerMinute: number;
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class InvalidationAuditService {
  private readonly MAX_ENTRIES = 1000;
  private buffer: InvalidationRecord[] = [];

  /**
   * Records an invalidation event. Keeps only the last 1000 entries.
   */
  record(entry: Omit<InvalidationRecord, 'timestamp'>): void {
    this.buffer.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });

    // Trim oldest if over capacity
    if (this.buffer.length > this.MAX_ENTRIES) {
      this.buffer = this.buffer.slice(-this.MAX_ENTRIES);
    }
  }

  /**
   * Returns the most recent 100 invalidation events.
   */
  getRecentInvalidations(limit = 100): InvalidationRecord[] {
    return this.buffer.slice(-limit).reverse();
  }

  /**
   * Computes aggregate invalidation statistics.
   */
  getInvalidationStats(): InvalidationStats {
    const total = this.buffer.length;

    if (total === 0) {
      return {
        totalInvalidations: 0,
        byEventType: {},
        avgKeysPerInvalidation: 0,
        peakInvalidationsPerMinute: 0,
      };
    }

    // Count by event type
    const byEventType: Record<string, number> = {};
    let totalKeys = 0;

    for (const entry of this.buffer) {
      byEventType[entry.eventType] = (byEventType[entry.eventType] ?? 0) + 1;
      totalKeys += entry.keysAffected;
    }

    // Peak invalidations per minute (sliding window of last 60 entries)
    const recentWindow = this.buffer.slice(-60);
    const windowDuration =
      recentWindow.length > 1
        ? (new Date(recentWindow[recentWindow.length - 1].timestamp).getTime() -
            new Date(recentWindow[0].timestamp).getTime()) /
          60_000
        : 1;

    const peakPerMinute = Math.round(recentWindow.length / Math.max(windowDuration, 0.1));

    return {
      totalInvalidations: total,
      byEventType,
      avgKeysPerInvalidation: parseFloat((totalKeys / total).toFixed(1)),
      peakInvalidationsPerMinute: peakPerMinute,
    };
  }

  /**
   * Clears the audit buffer.
   */
  reset(): void {
    this.buffer = [];
  }
}
