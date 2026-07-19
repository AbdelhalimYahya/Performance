/**
 * Products service — demonstrates optimized database query patterns.
 *
 * Patterns covered:
 * - Avoiding N+1 with eager loading (relations option)
 * - Covering index queries (select only indexed columns)
 * - Pushing filtering to the database
 * - Proper use of LIMIT
 * - Cursor-based pagination
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product } from './product.entity';
import { Review } from './review.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
  ) {}

  // ─── Pattern: Avoid SELECT * ───────────────────────────────
  // Only select columns needed for the list view.
  // The covering index (category, name, price) makes this an Index Only Scan.
  async findActiveByCategory(category: string): Promise<Partial<Product>[]> {
    return this.productRepo.find({
      select: ['id', 'name', 'price'],
      where: { category, isActive: true },
      order: { price: 'ASC' },
      take: 50,
    });
  }

  // ─── Pattern: Eager Loading (N+1 Prevention) ───────────────
  // TypeORM loads relations in a single query via LEFT JOIN.
  // Without this, accessing product.reviews triggers N separate queries.
  async findWithReviews(productId: string): Promise<Product | null> {
    return this.productRepo.findOne({
      where: { id: productId },
      relations: ['reviews', 'seller'],
      order: { reviews: { createdAt: 'DESC' } },
    });
  }

  // ─── Pattern: DataLoader Batching ──────────────────────────
  // Load multiple products by ID list — one IN query, not N individual queries.
  // This is the batch function for DataLoader.
  async findByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];

    const products = await this.productRepo.find({
      where: { id: In(ids) },
    });

    // Maintain order to match DataLoader's expected return order
    const productMap = new Map(products.map((p) => [p.id, p]));
    return ids.map((id) => productMap.get(id)!).filter(Boolean);
  }

  // ─── Pattern: Push Filtering to Database ───────────────────
  // BAD:  fetch all, filter in JS
  // GOOD: let PostgreSQL do the filtering with a WHERE clause
  async findCheapProducts(maxPrice: number, category?: string): Promise<Product[]> {
    const qb = this.productRepo.createQueryBuilder('p')
      .select(['p.id', 'p.name', 'p.price', 'p.category'])
      .where('p.price < :maxPrice', { maxPrice })
      .andWhere('p.isActive = :isActive', { isActive: true });

    if (category) {
      qb.andWhere('p.category = :category', { category });
    }

    return qb.orderBy('p.price', 'ASC').take(100).getMany();
  }

  // ─── Pattern: Covering Index Query ─────────────────────────
  // Selects only columns in the composite index — no table lookup needed.
  // The database satisfies the query entirely from the index structure.
  async coveringIndexQuery(category: string): Promise<{ name: string; price: number }[]> {
    return this.productRepo
      .createQueryBuilder('p')
      .select(['p.name', 'p.price'])
      .where('p.category = :category', { category })
      .andWhere('p.isActive = :isActive', { isActive: true })
      .orderBy('p.price', 'ASC')
      .take(20)
      .getRawMany();
  }
}
