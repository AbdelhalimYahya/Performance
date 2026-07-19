/**
 * cache-invalidation.service.ts — Event-driven cache invalidation handlers
 *
 * Listens to product/category events and invalidates the appropriate cache
 * entries. Every handler logs timing and key counts for the audit trail.
 *
 * Pattern: invalidate first, re-warm if needed, then log.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheService } from '../cache/cache.service';
import { InvalidationAuditService } from './invalidation-audit.service';
import {
  ProductCreatedEvent,
  ProductUpdatedEvent,
  ProductDeletedEvent,
  CategoryUpdatedEvent,
  PriceBulkUpdatedEvent,
} from './events/cache.events';

@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly audit: InvalidationAuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Product Created — invalidate lists, keep detail warm
  // ---------------------------------------------------------------------------

  @OnEvent('product.created')
  async handleProductCreated(event: ProductCreatedEvent): Promise<void> {
    const start = performance.now();
    let keysAffected = 0;

    // New product means all list caches are stale
    keysAffected += await this.cache.delByPattern('products:list:*');

    // Pre-warm the detail cache for the new product
    await this.cache.set(
      this.cache.buildKey('products', 'detail', event.product.id),
      event.product,
      300,
    );

    const duration = performance.now() - start;
    this.logInvalidation('product.created', keysAffected, duration, event.correlationId);
  }

  // ---------------------------------------------------------------------------
  // Product Updated — invalidate detail + matching lists, re-warm detail
  // ---------------------------------------------------------------------------

  @OnEvent('product.updated')
  async handleProductUpdated(event: ProductUpdatedEvent): Promise<void> {
    const start = performance.now();
    let keysAffected = 0;

    // Invalidate the specific detail key
    const detailKey = this.cache.buildKey('products', 'detail', event.id);
    await this.cache.del(detailKey);
    keysAffected++;

    // Invalidate all list caches (any list might contain this product)
    keysAffected += await this.cache.delByPattern('products:list:*');

    // Re-warm the detail cache with updated data (simulated)
    await this.cache.set(detailKey, { id: event.id, ...event.changes }, 300);

    const duration = performance.now() - start;
    this.logInvalidation('product.updated', keysAffected, duration, event.correlationId);
  }

  // ---------------------------------------------------------------------------
  // Product Deleted — invalidate detail + all lists + popular
  // ---------------------------------------------------------------------------

  @OnEvent('product.deleted')
  async handleProductDeleted(event: ProductDeletedEvent): Promise<void> {
    const start = performance.now();
    let keysAffected = 0;

    // Delete the detail key
    await this.cache.del(this.cache.buildKey('products', 'detail', event.id));
    keysAffected++;

    // Invalidate all list caches
    keysAffected += await this.cache.delByPattern('products:list:*');

    // Invalidate popular products (deleted item might have been popular)
    await this.cache.del(this.cache.buildKey('products', 'popular'));
    keysAffected++;

    // Invalidate stats (total count changed)
    await this.cache.del(this.cache.buildKey('products', 'stats', 'summary'));
    keysAffected++;

    const duration = performance.now() - start;
    this.logInvalidation('product.deleted', keysAffected, duration, event.correlationId);
  }

  // ---------------------------------------------------------------------------
  // Category Updated — invalidate list caches for that category
  // ---------------------------------------------------------------------------

  @OnEvent('category.updated')
  async handleCategoryUpdated(event: CategoryUpdatedEvent): Promise<void> {
    const start = performance.now();
    let keysAffected = 0;

    // Invalidate list caches that filter by this category
    // Pattern: products:list:*category* (approximation — real impl would use tag-based)
    keysAffected += await this.cache.delByPattern('products:list:*');

    const duration = performance.now() - start;
    this.logInvalidation('category.updated', keysAffected, duration, event.correlationId);
  }

  // ---------------------------------------------------------------------------
  // Price Bulk Updated — batch invalidate affected product details
  // ---------------------------------------------------------------------------

  @OnEvent('price.bulk_updated')
  async handlePriceBulkUpdated(event: PriceBulkUpdatedEvent): Promise<void> {
    const start = performance.now();
    let keysAffected = 0;

    // Build all detail keys for the affected products
    const detailKeys = event.productIds.map((id) =>
      this.cache.buildKey('products', 'detail', id),
    );

    // Delete each detail key
    await Promise.all(detailKeys.map((key) => this.cache.del(key)));
    keysAffected += detailKeys.length;

    // Invalidate all list caches (prices changed)
    keysAffected += await this.cache.delByPattern('products:list:*');

    // Invalidate popular (prices may affect popularity ranking)
    await this.cache.del(this.cache.buildKey('products', 'popular'));
    keysAffected++;

    const duration = performance.now() - start;
    this.logInvalidation('price.bulk_updated', keysAffected, duration, event.correlationId);
  }

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  private logInvalidation(
    eventType: string,
    keysAffected: number,
    duration: number,
    correlationId: string,
  ): void {
    this.logger.log(
      `[${eventType}] keys=${keysAffected} duration=${duration.toFixed(2)}ms correlationId=${correlationId}`,
    );

    this.audit.record({
      eventType,
      keysAffected,
      duration: parseFloat(duration.toFixed(2)),
      correlationId,
    });
  }
}
