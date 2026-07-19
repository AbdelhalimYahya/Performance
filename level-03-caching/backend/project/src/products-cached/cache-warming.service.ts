/**
 * cache-warming.service.ts — Proactive cache warming before TTL expiry
 *
 * Runs on a cron schedule to refresh hot cache entries before they expire.
 * Prevents cold-cache spikes after TTL expiry and ensures popular data is
 * always available from cache.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CacheService } from '../cache/cache.service';
import { ProductsCachedService } from './products-cached.service';

// ============================================================================
// Types
// ============================================================================

export interface WarmingStatus {
  lastRun: string | null;
  keysWarmed: number;
  duration: number;
  nextRun: string;
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class CacheWarmingService {
  private readonly logger = new Logger(CacheWarmingService.name);

  private lastRun: string | null = null;
  private keysWarmed = 0;
  private duration = 0;

  // Simulated category list (normally from DB)
  private readonly categories = [
    'electronics', 'clothing', 'home', 'sports', 'books',
    'toys', 'garden', 'auto', 'health', 'food',
  ];

  constructor(
    private readonly cache: CacheService,
    private readonly productsService: ProductsCachedService,
  ) {}

  // ---------------------------------------------------------------------------
  // Cron: run every 55 minutes (just before the 60-min TTL on popular data)
  // ---------------------------------------------------------------------------

  @Cron('0 */55 * * * *')
  async handleWarming(): Promise<void> {
    this.logger.log('Cache warming started');
    const start = Date.now();
    let warmed = 0;

    try {
      warmed += await this.warmPopularProducts();
      warmed += await this.warmCategoryLists();
      warmed += await this.warmStats();
    } catch (err) {
      this.logger.error(`Cache warming failed: ${err}`);
    }

    this.lastRun = new Date().toISOString();
    this.keysWarmed = warmed;
    this.duration = Date.now() - start;

    this.logger.log(
      `Cache warming completed: ${warmed} keys in ${this.duration}ms`,
    );
  }

  // ---------------------------------------------------------------------------
  // Individual warming methods
  // ---------------------------------------------------------------------------

  /**
   * Pre-fetches and caches the popular products list.
   * This is the hot path — always cache-first.
   */
  async warmPopularProducts(): Promise<number> {
    const start = Date.now();
    await this.productsService.getPopularProducts();
    this.logger.debug(`Warmed products:popular in ${Date.now() - start}ms`);
    return 1;
  }

  /**
   * Pre-fetches and caches a product list for each category.
   * 10 categories × 1 page each = 10 cache entries.
   */
  async warmCategoryLists(): Promise<number> {
    const start = Date.now();

    await Promise.all(
      this.categories.map(async (category) => {
        await this.productsService.findAll({ category, page: 1, limit: 20 });
      }),
    );

    this.logger.debug(
      `Warmed ${this.categories.length} category lists in ${Date.now() - start}ms`,
    );
    return this.categories.length;
  }

  /**
   * Pre-computes and caches the summary statistics.
   */
  async warmStats(): Promise<number> {
    const start = Date.now();
    await this.productsService.getSummaryStats();
    this.logger.debug(`Warmed products:stats:summary in ${Date.now() - start}ms`);
    return 1;
  }

  // ---------------------------------------------------------------------------
  // Manual trigger + status
  // ---------------------------------------------------------------------------

  /**
   * Manually triggers a full warming cycle.
   * Called from the controller's DELETE /cache/warm endpoint.
   */
  async manualWarm(): Promise<WarmingStatus> {
    await this.handleWarming();
    return this.getWarmingStatus();
  }

  /**
   * Returns the current warming status.
   */
  getWarmingStatus(): WarmingStatus {
    // Calculate next run: every 55 minutes from the last run
    const now = new Date();
    let nextRun = new Date(now);

    if (this.lastRun) {
      const last = new Date(this.lastRun);
      nextRun = new Date(last.getTime() + 55 * 60 * 1000);
      if (nextRun <= now) {
        nextRun = new Date(now.getTime() + 55 * 60 * 1000);
      }
    }

    return {
      lastRun: this.lastRun,
      keysWarmed: this.keysWarmed,
      duration: this.duration,
      nextRun: nextRun.toISOString(),
    };
  }
}
