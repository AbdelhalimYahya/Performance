/**
 * Products controller — REST endpoints for product queries.
 *
 * Demonstrates:
 * - Proper HTTP status codes for database operations
 * - Query parameter validation
 * - Response structure for list vs detail views
 */
import { Controller, Get, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('api/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // GET /api/products?category=electronics
  @Get()
  @HttpCode(HttpStatus.OK)
  async findByCategory(@Query('category') category: string) {
    return this.productsService.findActiveByCategory(category || 'electronics');
  }

  // GET /api/products/:id
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    return this.productsService.findWithReviews(id);
  }

  // GET /api/products/batch?id=1&id=2&id=3
  @Get('batch')
  @HttpCode(HttpStatus.OK)
  async findByIds(@Query('id') ids: string[]) {
    return this.productsService.findByIds(Array.isArray(ids) ? ids : [ids]);
  }

  // GET /api/products/search?maxPrice=100&category=electronics
  @Get('search')
  @HttpCode(HttpStatus.OK)
  async search(
    @Query('maxPrice') maxPrice: string,
    @Query('category') category?: string,
  ) {
    return this.productsService.findCheapProducts(
      parseFloat(maxPrice) || 100,
      category,
    );
  }

  // GET /api/products/covering?category=electronics
  @Get('covering')
  @HttpCode(HttpStatus.OK)
  async coveringQuery(@Query('category') category: string) {
    return this.productsService.coveringIndexQuery(category || 'electronics');
  }
}
