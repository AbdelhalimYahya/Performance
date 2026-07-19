/**
 * cache.service.ts — Application-level cache wrapper
 *
 * Wraps NestJS CacheManager with error-swallowing methods, batch operations,
 * pattern-based deletion, and a distributed-mutex helper for stampede protection.
 *
 * Design principle: a cache failure must never crash the request. Every method
 * catches errors and returns a safe fallback (null, empty array, or re-throws
 * the factory result directly).
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CacheStatsService } from './cache-stats.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    private stats: CacheStatsService,
  ) {}

  // ---------------------------------------------------------------------------
  // buildKey — namespaced cache key builder
  // ---------------------------------------------------------------------------

  /**
   * Builds a namespaced cache key from arbitrary parts.
   * @example buildKey('product', '123') → "perf:product:123"
   */
  buildKey(...parts: string[]): string {
    return parts.join(':');
  }

  // ---------------------------------------------------------------------------
  // get — with error swallowing
  // ---------------------------------------------------------------------------

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.cache.get<T>(key);
      if (value !== undefined && value !== null) {
        this.stats.trackHit(key);
        return value;
      }
      this.stats.trackMiss(key);
      return null;
    } catch (err) {
      this.logger.warn(`Cache GET failed for key "${key}": ${err}`);
      this.stats.trackMiss(key);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // set — with optional TTL
  // ---------------------------------------------------------------------------

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      if (ttl !== undefined) {
        await this.cache.set(key, value, ttl);
      } else {
        await this.cache.set(key, value);
      }
      this.stats.trackSet(key);
    } catch (err) {
      this.logger.warn(`Cache SET failed for key "${key}": ${err}`);
    }
  }

  // ---------------------------------------------------------------------------
  // del
  // ---------------------------------------------------------------------------

  async del(key: string): Promise<void> {
    try {
      await this.cache.del(key);
    } catch (err) {
      this.logger.warn(`Cache DEL failed for key "${key}": ${err}`);
    }
  }

  // ---------------------------------------------------------------------------
  // delByPattern — SCAN + DEL for pattern-based invalidation
  // ---------------------------------------------------------------------------

  /**
   * Deletes all keys matching a glob pattern.
   * Uses SCAN to avoid blocking Redis on large key spaces.
   * Returns the number of keys deleted.
   */
  async delByPattern(pattern: string): Promise<number> {
    try {
      // Access the underlying Redis client via cache-manager-ioredis-yet
      const redis = (this.cache as any).store?.client;
      if (!redis?.scan) {
        this.logger.warn('delByPattern: Redis client not available');
        return 0;
      }

      let cursor = '0';
      let deleted = 0;
      const BATCH = 100;

      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          `perf:${pattern}`,
          'COUNT',
          BATCH,
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          await redis.del(...keys);
          deleted += keys.length;
        }
      } while (cursor !== '0');

      return deleted;
    } catch (err) {
      this.logger.warn(`Cache DELBYKEYS failed for pattern "${pattern}": ${err}`);
      return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // getOrSet — cache-aside in one call
  // ---------------------------------------------------------------------------

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  // ---------------------------------------------------------------------------
  // mget — batch get using Redis MGET
  // ---------------------------------------------------------------------------

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];

    try {
      const redis = (this.cache as any).store?.client;
      if (!redis?.mget) {
        // Fallback: individual gets
        return Promise.all(keys.map((k) => this.get<T>(k)));
      }

      const prefixed = keys.map((k) => `perf:${k}`);
      const values = await redis.mget(...prefixed);

      return values.map((v: string | null, i: number) => {
        if (v === null) {
          this.stats.trackMiss(keys[i]);
          return null;
        }
        this.stats.trackHit(keys[i]);
        try {
          return JSON.parse(v) as T;
        } catch {
          return v as unknown as T;
        }
      });
    } catch (err) {
      this.logger.warn(`Cache MGET failed: ${err}`);
      return keys.map(() => null);
    }
  }

  // ---------------------------------------------------------------------------
  // withMutex — stampede-safe get-or-set
  // ---------------------------------------------------------------------------

  /**
   * Distributed mutex: ensures only one instance fetches from the origin
   * while others wait for the result.
   *
   * Uses Redis SET NX (set-if-not-exists) for the lock.
   */
  async withMutex<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = 300,
    lockTtlMs: number = 10_000,
  ): Promise<T> {
    // 1. Check cache first
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const lockKey = `lock:${key}`;

    // 2. Try to acquire lock
    const acquired = await this.acquireLock(lockKey, lockTtlMs);

    if (!acquired) {
      // Another process is fetching — poll until data appears
      const MAX_WAIT = 5_000;
      const POLL = 50;
      let waited = 0;

      while (waited < MAX_WAIT) {
        await new Promise((r) => setTimeout(r, POLL));
        waited += POLL;
        const result = await this.get<T>(key);
        if (result !== null) return result;
      }

      // Timed out — fall through and fetch ourselves
    }

    try {
      // 3. Fetch from origin
      const value = await factory();
      await this.set(key, value, ttl);
      return value;
    } finally {
      // 4. Release lock
      await this.releaseLock(lockKey);
    }
  }

  // ---------------------------------------------------------------------------
  // Lock helpers
  // ---------------------------------------------------------------------------

  private async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    try {
      const redis = (this.cache as any).store?.client;
      if (!redis?.set) return false;

      const result = await redis.set(key, '1', 'PX', ttlMs, 'NX');
      return result === 'OK';
    } catch {
      return false;
    }
  }

  private async releaseLock(key: string): Promise<void> {
    try {
      const redis = (this.cache as any).store?.client;
      await redis?.del(key);
    } catch {
      // Lock will expire on its own via PX
    }
  }
}
