/**
 * cache-stats.service.ts — In-process cache metrics tracker
 *
 * Tracks hit/miss/set/eviction counters and exposes them as a summary.
 * Also queries Redis directly for server-level stats via the INFO command.
 *
 * This service is singleton-scoped — all instances share the same counters
 * within a single NestJS process.
 */

import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

// ============================================================================
// Types
// ============================================================================

export interface CacheStatsSummary {
  hits: number;
  misses: number;
  hitRate: number;
  sets: number;
  evictions: number;
  keyCount: number;
  topKeys: { key: string; hits: number }[];
}

export interface RedisStats {
  connectedClients: number;
  keyspaceHits: number;
  keyspaceMisses: number;
  hitRate: number;
  usedMemoryHuman: string;
  usedMemoryPeakHuman: string;
  totalKeys: number;
  uptimeSeconds: number;
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class CacheStatsService {
  // In-process counters — reset on process restart.
  private hits = new Map<string, number>();
  private misses = new Map<string, number>();
  private sets = 0;
  private evictions = 0;

  private redis: Redis | null = null;

  // ---------------------------------------------------------------------------
  // Counter methods
  // ---------------------------------------------------------------------------

  trackHit(key: string): void {
    this.hits.set(key, (this.hits.get(key) ?? 0) + 1);
  }

  trackMiss(key: string): void {
    this.misses.set(key, (this.misses.get(key) ?? 0) + 1);
  }

  trackSet(_key: string): void {
    this.sets++;
  }

  trackEviction(_key: string): void {
    this.evictions++;
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  getStats(): CacheStatsSummary {
    const totalHits = this.sumMap(this.hits);
    const totalMisses = this.sumMap(this.misses);
    const total = totalHits + totalMisses;

    // Top 10 most-hit keys
    const topKeys = [...this.hits.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, hits]) => ({ key, hits }));

    return {
      hits: totalHits,
      misses: totalMisses,
      hitRate: total === 0 ? 0 : parseFloat((totalHits / total).toFixed(4)),
      sets: this.sets,
      evictions: this.evictions,
      keyCount: this.hits.size + this.misses.size,
      topKeys,
    };
  }

  // ---------------------------------------------------------------------------
  // Redis INFO parsing
  // ---------------------------------------------------------------------------

  /**
   * Connects to Redis and runs INFO to get server-level stats.
   * Lazily creates the connection on first call.
   */
  async getRedisInfo(
    host = 'localhost',
    port = 6379
  ): Promise<RedisStats> {
    if (!this.redis) {
      this.redis = new Redis({ host, port, lazyConnect: true });
      await this.redis.connect();
    }

    const info = await this.redis.info();

    const parse = (key: string, fallback = '0'): number => {
      const match = info.match(new RegExp(`${key}:(\\d+)`));
      return parseInt(match?.[1] ?? fallback, 10);
    };

    const parseStr = (key: string, fallback = 'N/A'): string => {
      const match = info.match(new RegExp(`${key}:(.+)`));
      return match?.[1]?.trim() ?? fallback;
    };

    const keyspaceHits = parse('keyspace_hits');
    const keyspaceMisses = parse('keyspace_misses');
    const total = keyspaceHits + keyspaceMisses;

    const keyspaceInfo = info.match(/db0:keys=(\d+)/);
    const totalKeys = parseInt(keyspaceInfo?.[1] ?? '0', 10);

    return {
      connectedClients: parse('connected_clients'),
      keyspaceHits,
      keyspaceMisses,
      hitRate: total === 0 ? 0 : parseFloat((keyspaceHits / total).toFixed(4)),
      usedMemoryHuman: parseStr('used_memory_human'),
      usedMemoryPeakHuman: parseStr('used_memory_peak_human'),
      totalKeys,
      uptimeSeconds: parse('uptime_in_seconds'),
    };
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  reset(): void {
    this.hits.clear();
    this.misses.clear();
    this.sets = 0;
    this.evictions = 0;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private sumMap(map: Map<string, number>): number {
    let sum = 0;
    for (const v of map.values()) sum += v;
    return sum;
  }
}
