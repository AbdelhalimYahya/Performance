/**
 * cache-invalidation.controller.ts — Audit and simulation endpoints
 *
 * Provides visibility into cache invalidation activity and a simulation
 * endpoint for testing event handlers without touching the real database.
 */

import { Controller, Get, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvalidationAuditService } from './invalidation-audit.service';
import {
  ProductCreatedEvent,
  ProductUpdatedEvent,
  ProductDeletedEvent,
  CategoryUpdatedEvent,
  PriceBulkUpdatedEvent,
} from './events/cache.events';

// ============================================================================
// Types
// ============================================================================

interface SimulateDto {
  eventType: string;
  payload?: Record<string, unknown>;
}

// ============================================================================
// Controller
// ============================================================================

@Controller('cache-invalidation')
export class CacheInvalidationController {
  constructor(
    private readonly audit: InvalidationAuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ---------------------------------------------------------------------------
  // GET /cache-invalidation/audit — recent invalidation events
  // ---------------------------------------------------------------------------
  @Get('audit')
  getAudit() {
    return {
      entries: this.audit.getRecentInvalidations(100),
      count: this.audit.getRecentInvalidations().length,
    };
  }

  // ---------------------------------------------------------------------------
  // GET /cache-invalidation/stats — aggregate invalidation statistics
  // ---------------------------------------------------------------------------
  @Get('stats')
  getStats() {
    return this.audit.getInvalidationStats();
  }

  // ---------------------------------------------------------------------------
  // POST /cache-invalidation/simulate — manually trigger an event for testing
  //
  // Accepts: { eventType: string, payload?: object }
  //
  // Supported event types:
  //   - product.created   { product: { id, name, category, price } }
  //   - product.updated   { id: string, changes: object }
  //   - product.deleted   { id: string }
  //   - category.updated  { categoryId: string }
  //   - price.bulk_updated { productIds: string[] }
  // ---------------------------------------------------------------------------
  @Post('simulate')
  simulate(@Body() dto: SimulateDto) {
    const { eventType, payload } = dto;

    switch (eventType) {
      case 'product.created': {
        const event = new ProductCreatedEvent({
          id: (payload?.id as string) ?? `sim-${Date.now()}`,
          name: (payload?.name as string) ?? 'Simulated Product',
          category: (payload?.category as string) ?? 'electronics',
          price: (payload?.price as number) ?? 99.99,
        });
        this.eventEmitter.emit('product.created', event);
        return { emitted: eventType, correlationId: event.correlationId };
      }

      case 'product.updated': {
        const event = new ProductUpdatedEvent(
          (payload?.id as string) ?? 'prod-1',
          (payload?.changes as Record<string, unknown>) ?? { price: 149.99 },
        );
        this.eventEmitter.emit('product.updated', event);
        return { emitted: eventType, correlationId: event.correlationId };
      }

      case 'product.deleted': {
        const event = new ProductDeletedEvent(
          (payload?.id as string) ?? 'prod-1',
        );
        this.eventEmitter.emit('product.deleted', event);
        return { emitted: eventType, correlationId: event.correlationId };
      }

      case 'category.updated': {
        const event = new CategoryUpdatedEvent(
          (payload?.categoryId as string) ?? 'cat-1',
        );
        this.eventEmitter.emit('category.updated', event);
        return { emitted: eventType, correlationId: event.correlationId };
      }

      case 'price.bulk_updated': {
        const event = new PriceBulkUpdatedEvent(
          (payload?.productIds as string[]) ?? ['prod-1', 'prod-2', 'prod-3'],
        );
        this.eventEmitter.emit('price.bulk_updated', event);
        return { emitted: eventType, correlationId: event.correlationId };
      }

      default:
        throw new HttpException(
          `Unknown event type: ${eventType}. Supported: product.created, product.updated, product.deleted, category.updated, price.bulk_updated`,
          HttpStatus.BAD_REQUEST,
        );
    }
  }
}
