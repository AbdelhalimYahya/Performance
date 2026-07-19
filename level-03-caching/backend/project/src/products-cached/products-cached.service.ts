/**
 * products-cached.service.ts — Products service with full cache-aside pattern
 *
 * Every read goes through the cache first. Every write invalidates the
 * relevant cache entries. Hot paths use withMutex to prevent stampede.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { CacheService } from '../cache/cache.service';

// ============================================================================
// Types
// ============================================================================

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  isActive: boolean;
  createdAt: string;
}

export interface ProductFilters {
  page?: number;
  limit?: number;
  category?: string;
  sort?: string;
}

export interface ProductStats {
  total: number;
  activeCount: number;
  avgPrice: number;
  totalValue: number;
}

// ============================================================================
// Simulated Database
// ============================================================================

const CATEGORIES = ['electronics', 'clothing', 'home', 'sports', 'books', 'toys', 'garden', 'auto', 'health', 'food'];

const db: Product[] = Array.from({ length: 500 }, (_, i) => ({
  id: `prod-${i + 1}`,
  name: `Product ${i + 1}`,
  category: CATEGORIES[i % CATEGORIES.length],
  price: parseFloat((Math.random() * 500 + 9.99).toFixed(2)),
  stock: (i % 200) + 1,
  isActive: i % 5 !== 0,
  createdAt: new Date(Date.now() - i * 86400000).toISOString(),
}));

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class ProductsCachedService {
  private readonly logger = new Logger(ProductsCachedService.name);

  // TTL constants (seconds)
  private readonly TTL_LIST = 120;
  private readonly TTL_DETAIL = 300;
  private readonly TTL_POPULAR = 3600;
  private readonly TTL_STATS = 60;

  constructor(private readonly cache: CacheService) {}

  // ---------------------------------------------------------------------------
  // Read operations (cache-first)
  // ---------------------------------------------------------------------------

  async findAll(filters: ProductFilters): Promise<{ data: Product[]; total: number }> {
    const filterHash = this.hashFilters(filters);
    const key = this.cache.buildKey('products', 'list', filterHash);

    return this.cache.withMutex(
      key,
      async () => {
        this.logger.debug(`Cache miss: ${key}`);
        let result = [...db];

        if (filters.category) {
          result = result.filter((p) => p.category === filters.category);
        }
        if (filters.sort === 'price') {
          result.sort((a, b) => a.price - b.price);
        }

        const page = filters.page ?? 1;
        const limit = filters.limit ?? 20;
        const start = (page - 1) * limit;

        return {
          data: result.slice(start, start + limit),
          total: result.length,
        };
      },
      this.TTL_LIST,
    );
  }

  async findOne(id: string): Promise<Product> {
    const key = this.cache.buildKey('products', 'detail', id);

    return this.cache.withMutex(
      key,
      async () => {
        this.logger.debug(`Cache miss: ${key}`);
        const product = db.find((p) => p.id === id);
        if (!product) throw new Error(`Product ${id} not found`);
        return product;
      },
      this.TTL_DETAIL,
    );
  }

  async getPopularProducts(): Promise<Product[]> {
    const key = this.cache.buildKey('products', 'popular');

    return this.cache.getOrSet(
      key,
      async () => {
        this.logger.debug('Cache miss: products:popular');
        // Simulate: popular = most viewed (sorted by stock as proxy)
        return [...db].sort((a, b) => b.stock - a.stock).slice(0, 20);
      },
      this.TTL_POPULAR,
    );
  }

  async getSummaryStats(): Promise<ProductStats> {
    const key = this.cache.buildKey('products', 'stats', 'summary');

    return this.cache.getOrSet(
      key,
      async () => {
        this.logger.debug('Cache miss: products:stats:summary');
        const active = db.filter((p) => p.isActive);
        return {
          total: db.length,
          activeCount: active.length,
          avgPrice: parseFloat((active.reduce((s, p) => s + p.price, 0) / active.length).toFixed(2)),
          totalValue: parseFloat(active.reduce((s, p) => s + p.price * p.stock, 0).toFixed(2)),
        };
      },
      this.TTL_STATS,
    );
  }

  // ---------------------------------------------------------------------------
  // Write operations (update DB then invalidate cache)
  // ---------------------------------------------------------------------------

  async create(dto: Omit<Product, 'id' | 'createdAt'>): Promise<Product> {
    const product: Product = {
      ...dto,
      id: `prod-${db.length + 1}`,
      createdAt: new Date().toISOString(),
    };
    db.push(product);

    // Invalidate all list caches
    const deleted = await this.cache.delByPattern('products:list:*');
    this.logger.log(`Invalidated ${deleted} list cache entries after create`);

    return product;
  }

  async update(id: string, dto: Partial<Omit<Product, 'id' | 'createdAt'>>): Promise<Product> {
    const index = db.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Product ${id} not found`);

    db[index] = { ...db[index], ...dto };

    // Invalidate detail + all list caches
    await this.cache.del(this.cache.buildKey('products', 'detail', id));
    const deleted = await this.cache.delByPattern('products:list:*');
    this.logger.log(`Invalidated detail + ${deleted} list cache entries after update`);

    return db[index];
  }

  async delete(id: string): Promise<void> {
    const index = db.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Product ${id} not found`);

    db.splice(index, 1);

    // Invalidate detail + all list caches
    await this.cache.del(this.cache.buildKey('products', 'detail', id));
    await this.cache.delByPattern('products:list:*');
    await this.cache.del(this.cache.buildKey('products', 'popular'));
    await this.cache.del(this.cache.buildKey('products', 'stats', 'summary'));
    this.logger.log(`Invalidated all caches after delete of ${id}`);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private hashFilters(filters: ProductFilters): string {
    const sorted = Object.keys(filters)
      .sort()
      .reduce((acc, k) => {
        acc[k] = (filters as any)[k];
        return acc;
      }, {} as Record<string, unknown>);
    return createHash('md5').update(JSON.stringify(sorted)).digest('hex').slice(0, 12);
  }
}
