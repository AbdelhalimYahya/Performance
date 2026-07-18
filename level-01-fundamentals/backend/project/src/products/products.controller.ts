import {
  Controller, Get, Post, Put, Delete,
  Param, Query, Body, Req, HttpCode,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Request } from 'express';
import { ProductsService, ProductSummary } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';

// ============================================================================
// Benchmark Decorator
// ============================================================================

function Benchmark(): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;

    descriptor.value = async function (this: ProductsService, ...args: unknown[]) {
      const start = performance.now();
      const result = await originalMethod.apply(this, args);
      const duration = performance.now() - start;
      console.log(`[Benchmark] ${String(propertyKey)}: ${duration.toFixed(2)}ms`);
      return result;
    };

    return descriptor;
  };
}

// ============================================================================
// Products Controller
// ============================================================================

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * List products with pagination, filtering, and sorting.
   * Reads X-Slow-Mode header to toggle slow mode for profiling demos.
   */
  @Get()
  @ApiOperation({ summary: 'List products with pagination' })
  @ApiResponse({ status: 200, description: 'Paginated list of products' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'sort', required: false, enum: ['price', 'name', 'date'] })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @Benchmark()
  async findAll(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('sort') sort?: 'price' | 'name' | 'date',
    @Query('order') order?: 'asc' | 'desc',
  ) {
    this.productsService.setSlowMode(req.headers['x-slow-mode'] === 'true');
    return this.productsService.findAll({
      page: parseInt(page ?? '1', 10),
      limit: Math.min(parseInt(limit ?? '20', 10), 100),
      category,
      sort,
      order,
    });
  }

  /**
   * Get aggregated product statistics.
   * Intentionally slow (O(n) scan without caching) for profiling demos.
   */
  @Get('stats/summary')
  @ApiOperation({ summary: 'Get aggregated product statistics' })
  @ApiResponse({ status: 200, description: 'Product summary with category counts and price range' })
  @Benchmark()
  async getSummary(@Req() req: Request): Promise<ProductSummary> {
    this.productsService.setSlowMode(req.headers['x-slow-mode'] === 'true');
    return this.productsService.getSummary();
  }

  /**
   * Get a single product by ID. O(1) lookup.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiResponse({ status: 200, description: 'Product found' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiParam({ name: 'id', type: String })
  @Benchmark()
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  /**
   * Create a new product.
   */
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Benchmark()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  /**
   * Update an existing product.
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update a product' })
  @ApiResponse({ status: 200, description: 'Product updated' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiParam({ name: 'id', type: String })
  @Benchmark()
  update(@Param('id') id: string, @Body() dto: Partial<CreateProductDto>) {
    return this.productsService.update(id, dto);
  }

  /**
   * Delete a product by ID.
   */
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a product' })
  @ApiResponse({ status: 204, description: 'Product deleted' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiParam({ name: 'id', type: String })
  @Benchmark()
  delete(@Param('id') id: string) {
    this.productsService.delete(id);
  }
}
