/**
 * DataLoader controller — demonstrates N+1 prevention with DataLoader.
 *
 * Each endpoint shows a different DataLoader usage pattern:
 * - Single product with seller (two loaders)
 * - Product list with review counts (N+1 eliminated)
 * - Full product detail (nested relations via multiple loaders)
 */
import { Controller, Get, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { DataLoaderService } from './dataloader.service';

@Controller('api/dataloader')
export class DataLoaderController {
  constructor(private readonly loaderService: DataLoaderService) {}

  // GET /api/dataloader/product/:id
  // Loads product + seller + reviews using 3 separate loaders.
  // Without DataLoader, this would be 3 SQL queries (or N queries per product).
  @Get('product/:id')
  @HttpCode(HttpStatus.OK)
  async getProduct(@Param('id') id: string) {
    // Load product via DataLoader (batch-friendly)
    const product = await this.loaderService.productLoader.load(id);

    // Load seller via DataLoader (if we had multiple products, this would batch)
    const seller = await this.loaderService.userLoader.load(product.sellerId);

    // Load reviews via DataLoader (batches all product IDs in one query)
    const reviews = await this.loaderService.reviewsByProductLoader.load(id);

    return {
      ...product,
      seller: { id: seller.id, name: seller.name, rating: seller.rating },
      reviewCount: reviews.length,
      averageRating:
        reviews.length > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0,
    };
  }

  // GET /api/dataloader/products?ids=id1,id2,id3
  // Loads multiple products in one batch query.
  // Each product's seller is also batch-loaded — total: 2 SQL queries instead of 3N.
  @Get('products')
  @HttpCode(HttpStatus.OK)
  async getProducts(@Query('ids') idsParam: string) {
    const ids = idsParam.split(',').filter(Boolean);

    // Batch load all products — ONE SQL query
    const products = await Promise.all(
      ids.map((id) => this.loaderService.productLoader.load(id)),
    );

    // Batch load all sellers — ONE SQL query (deduplicates seller IDs)
    const sellerIds = [...new Set(products.map((p) => p.sellerId))];
    await Promise.all(
      sellerIds.map((id) => this.loaderService.userLoader.load(id)),
    );

    // Batch load all reviews — ONE SQL query
    await Promise.all(
      ids.map((id) => this.loaderService.reviewsByProductLoader.load(id)),
    );

    // Now all data is in DataLoader caches — build response without extra queries
    const results = await Promise.all(
      products.map(async (product) => {
        const seller = await this.loaderService.userLoader.load(product.sellerId);
        const reviews = await this.loaderService.reviewsByProductLoader.load(product.id);

        return {
          ...product,
          seller: { id: seller.id, name: seller.name },
          reviewCount: reviews.length,
        };
      }),
    );

    // Total SQL queries: 3 (products + users + reviews)
    // Without DataLoader: N products × (1 product query + 1 user query + 1 review query) = 3N
    console.log(`[DataLoader] Loaded ${results.length} products with 3 SQL queries`);

    return results;
  }
}
