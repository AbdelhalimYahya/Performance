/**
 * DataLoader service — implements batch loading with deduplication.
 *
 * How DataLoader works:
 * 1. Call loader.load(id) — queues the ID
 * 2. At end of event loop tick, DataLoader calls batchFn([id1, id2, ...])
 * 3. Batch function runs ONE SQL query: WHERE id IN (id1, id2, ...)
 * 4. Results are mapped back to individual promises
 * 5. Subsequent loads of the same ID return the cached result (no query)
 *
 * Key guarantee: batchFn receives unique IDs only (deduplication automatic).
 */
import { Injectable, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import DataLoader from 'dataloader';
import { Product } from '../products/product.entity';
import { User } from '../products/user.entity';
import { Review } from '../products/review.entity';

// Batch result must match input order: result[i] corresponds to keys[i]
type BatchResult<T> = (T | Error)[];

@Injectable({ scope: Scope.REQUEST })
export class DataLoaderService {
  // ─── Product Loader ────────────────────────────────────────
  // Collects all product IDs loaded during a single request.
  // Fires one SELECT * FROM products WHERE id IN (...) query.
  readonly productLoader = new DataLoader<string, Product>(
    async (ids: readonly string[]): Promise<BatchResult<Product>> => {
      console.log(`[DataLoader] Batch loading ${ids.length} products`);

      const products = await this.productRepo.find({
        where: { id: In([...ids]) },
      });

      // Build lookup map and return results in same order as input keys
      const productMap = new Map(products.map((p) => [p.id, p]));
      return ids.map(
        (id) =>
          productMap.get(id) ??
          new Error(`Product ${id} not found in batch`),
      );
    },
    // Options
    {
      maxBatchSize: 100, // PostgreSQL has a limit on IN list length
      cache: true, // cache results per-request (default)
    },
  );

  // ─── User Loader ───────────────────────────────────────────
  // Loads sellers/users for product detail views.
  readonly userLoader = new DataLoader<string, User>(
    async (ids: readonly string[]): Promise<BatchResult<User>> => {
      console.log(`[DataLoader] Batch loading ${ids.length} users`);

      const users = await this.userRepo.find({
        where: { id: In([...ids]) },
      });

      const userMap = new Map(users.map((u) => [u.id, u]));
      return ids.map(
        (id) =>
          userMap.get(id) ?? new Error(`User ${id} not found in batch`),
      );
    },
  );

  // ─── Reviews Loader ────────────────────────────────────────
  // Loads all reviews for a set of product IDs.
  // Used to solve N+1 when listing products with their review counts.
  readonly reviewsByProductLoader = new DataLoader<string, Review[]>(
    async (productIds: readonly string[]): Promise<BatchResult<Review[]>> => {
      console.log(
        `[DataLoader] Batch loading reviews for ${productIds.length} products`,
      );

      const reviews = await this.reviewRepo.find({
        where: { productId: In([...productIds]) },
        order: { createdAt: 'DESC' },
      });

      // Group reviews by productId
      const reviewsMap = new Map<string, Review[]>();
      for (const review of reviews) {
        const existing = reviewsMap.get(review.productId) ?? [];
        existing.push(review);
        reviewsMap.set(review.productId, existing);
      }

      return productIds.map((id) => reviewsMap.get(id) ?? []);
    },
  );

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
  ) {}

  /**
   * Clear all per-request caches.
   * Call this in exception filters or edge cases where you need a fresh state.
   */
  clearAll(): void {
    this.productLoader.clearAll();
    this.userLoader.clearAll();
    this.reviewsByProductLoader.clearAll();
  }
}
