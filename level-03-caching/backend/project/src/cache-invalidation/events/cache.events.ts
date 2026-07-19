/**
 * cache.events.ts — Event classes for cache invalidation
 *
 * Every event carries a timestamp and correlationId for audit trail purposes.
 * Events are emitted via NestJS EventEmitter and handled by CacheInvalidationService.
 *
 * Pattern: event carries the minimum data needed for invalidation.
 * The handler decides HOW to invalidate; the emitter decides WHAT changed.
 */

import { randomUUID } from 'crypto';

// ============================================================================
// Base event
// ============================================================================

export abstract class CacheEvent {
  readonly timestamp: Date;
  readonly correlationId: string;

  constructor() {
    this.timestamp = new Date();
    this.correlationId = randomUUID();
  }
}

// ============================================================================
// Product events
// ============================================================================

export class ProductCreatedEvent extends CacheEvent {
  readonly type = 'product.created' as const;

  constructor(
    readonly product: {
      id: string;
      name: string;
      category: string;
      price: number;
    },
  ) {
    super();
  }
}

export class ProductUpdatedEvent extends CacheEvent {
  readonly type = 'product.updated' as const;

  constructor(
    readonly id: string,
    readonly changes: Record<string, unknown>,
  ) {
    super();
  }
}

export class ProductDeletedEvent extends CacheEvent {
  readonly type = 'product.deleted' as const;

  constructor(readonly id: string) {
    super();
  }
}

// ============================================================================
// Category events
// ============================================================================

export class CategoryUpdatedEvent extends CacheEvent {
  readonly type = 'category.updated' as const;

  constructor(readonly categoryId: string) {
    super();
  }
}

// ============================================================================
// Bulk events
// ============================================================================

export class PriceBulkUpdatedEvent extends CacheEvent {
  readonly type = 'price.bulk_updated' as const;

  constructor(readonly productIds: string[]) {
    super();
  }
}
