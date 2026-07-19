/**
 * products-cached.controller.ts — REST endpoints for cached products
 *
 * Demonstrates the full cache-aside lifecycle:
 *   - GET endpoints decorated with @Cacheable + @CacheTTL
 *   - POST/DELETE endpoints that invalidate cache after DB writes
 *   - Cache stats and manual warming endpoints
 */

import {
  Controller, Get, Post, Delete, Param, Body, Query, Res, HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import {
  Cacheable, CacheKey, CacheTTL, CachePublic,
} from '../common/interceptors/cache.decorators';
import { ProductsCachedService, ProductFilters } from './products-cached.service';
import { CacheWarmingService } from './cache-warming.service';
import { CacheStatsService } from '../cache/cache-stats.service';

// ============================================================================
// DTOs
// ============================================================================

interface CreateProductDto {
  name: string;
  category: string;
  price: number;
  stock: number;
  isActive?: boolean;
}

// ============================================================================
// Controller
// ============================================================================

@Controller('products-cached')
export class ProductsCachedController {
  constructor(
    private readonly productsService: ProductsCachedService,
    private readonly warmingService: CacheWarmingService,
    private readonly statsService: CacheStatsService,
  ) {}

  // ---------------------------------------------------------------------------
  // GET /products-cached — list with cache (TTL 120s)
  // ---------------------------------------------------------------------------
  @Get()
  @Cacheable(120)
  @CacheKey('products-list')
  @CachePublic()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('sort') sort?: string,
  ) {
    const filters: ProductFilters = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      category,
      sort,
    };
    return this.productsService.findAll(filters);
  }

  // ---------------------------------------------------------------------------
  // GET /products-cached/:id — detail with cache (TTL 300s)
  // ---------------------------------------------------------------------------
  @Get(':id')
  @Cacheable(300)
  @CacheKey('products-detail')
  @CachePublic()
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  // ---------------------------------------------------------------------------
  // GET /products-cached/popular — hot path, aggressive caching (TTL 3600s)
  // ---------------------------------------------------------------------------
  @Get('popular')
  @Cacheable(3600)
  @CacheKey('products-popular')
  @CachePublic()
  async getPopular() {
    return this.productsService.getPopularProducts();
  }

  // ---------------------------------------------------------------------------
  // GET /products-cached/stats/summary — short TTL for semi-dynamic data
  // ---------------------------------------------------------------------------
  @Get('stats/summary')
  @Cacheable(60)
  @CacheKey('products-stats')
  @CachePublic()
  async getStats() {
    return this.productsService.getSummaryStats();
  }

  // ---------------------------------------------------------------------------
  // POST /products-cached — create + invalidate list caches
  // ---------------------------------------------------------------------------
  @Post()
  async create(@Body() dto: CreateProductDto) {
    const product = await this.productsService.create({
      name: dto.name,
      category: dto.category,
      price: dto.price,
      stock: dto.stock,
      isActive: dto.isActive ?? true,
    });
    return { message: 'Product created', product };
  }

  // ---------------------------------------------------------------------------
  // DELETE /products-cached/:id — delete + invalidate all related caches
  // ---------------------------------------------------------------------------
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.productsService.delete(id);
    return { message: `Product ${id} deleted` };
  }

  // ---------------------------------------------------------------------------
  // GET /products-cached/cache/stats — cache hit/miss stats + Redis info
  // ---------------------------------------------------------------------------
  @Get('cache/stats')
  async getCacheStats() {
    const localStats = this.statsService.getStats();
    let redisStats = null;

    try {
      redisStats = await this.statsService.getRedisInfo();
    } catch {
      redisStats = { error: 'Redis not connected' };
    }

    return {
      local: localStats,
      redis: redisStats,
    };
  }

  // ---------------------------------------------------------------------------
  // DELETE /products-cached/cache/warm — manually trigger cache warming
  // ---------------------------------------------------------------------------
  @Delete('cache/warm')
  async warmCache() {
    return this.warmingService.manualWarm();
  }
}
