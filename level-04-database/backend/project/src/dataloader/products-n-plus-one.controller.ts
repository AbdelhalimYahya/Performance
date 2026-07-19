/**
 * N+1 Controller — demonstrates the N+1 problem and three solutions.
 *
 * GET /n-plus-one/bad           — N+1: 20 products × (1 product query + 20 review queries) = 21 queries
 * GET /n-plus-one/good-include  — Fix with Prisma include: 1 query with JOIN
 * GET /n-plus-one/good-dataloader — Fix with DataLoader: batches 20 IDs into 2 queries (products + reviews)
 * GET /n-plus-one/comparison    — Runs all three, times each, returns side-by-side results
 */
import { Controller, Get, HttpCode, HttpStatus, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ProductDataLoader } from './product.dataloader';
import { ReviewDataLoader } from './review.dataloader';

interface ApproachResult {
  approach: string;
  queryCount: number;
  durationMs: number;
  queryLog: string[];
}

@Controller('n-plus-one')
export class ProductsNPlusOneController {
  private readonly logger = new Logger(ProductsNPlusOneController.name);

  // Track queries for the current request
  private queryLog: string[] = [];
  private queryCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ProductDataLoader) private readonly productLoader: ProductDataLoader,
    @Inject(ReviewDataLoader) private readonly reviewLoader: ReviewDataLoader,
  ) {
    // Listen to Prisma queries and count them
    this.prisma.$on('query', (event) => {
      this.queryCount++;
      this.queryLog.push(event.query.substring(0, 200));
    });
  }

  /**
   * BAD: N+1 Problem — fetches products one by one, then reviews one by one.
   *
   * Query 1: SELECT * FROM products WHERE isActive = true LIMIT 20
   * Query 2-21: SELECT * FROM reviews WHERE productId = $1 (once per product)
   *
   * Total: 21 queries for 20 products. This is the N+1 antipattern.
   */
  @Get('bad')
  @HttpCode(HttpStatus.OK)
  async badApproach() {
    this.resetCounters();

    // Query 1: fetch 20 products
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    // Queries 2-21: fetch reviews for EACH product individually (N+1!)
    const results = [];
    for (const product of products) {
      const reviews = await this.prisma.review.findMany({
        where: { productId: product.id },
        orderBy: { createdAt: 'desc' },
      });
      results.push({ ...product, reviews });
    }

    this.logger.log(`[BAD] ${this.queryCount} queries executed`);
    return {
      approach: 'N+1 (BAD)',
      queryCount: this.queryCount,
      products: results.length,
      queryLog: this.queryLog,
    };
  }

  /**
   * GOOD: Prisma include — loads products with reviews in one query using JOIN.
   *
   * Query 1: SELECT p.*, r.* FROM products p
   *          LEFT JOIN reviews r ON r.productId = p.id
   *          WHERE p.isActive = true
   *          ORDER BY p.createdAt DESC
   *          LIMIT 20
   *
   * Total: 1 query.
   */
  @Get('good-include')
  @HttpCode(HttpStatus.OK)
  async goodIncludeApproach() {
    this.resetCounters();

    // Single query with JOIN — no N+1
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        reviews: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    this.logger.log(`[GOOD-INCLUDE] ${this.queryCount} queries executed`);
    return {
      approach: 'Prisma Include (GOOD)',
      queryCount: this.queryCount,
      products: products.length,
      queryLog: this.queryLog,
    };
  }

  /**
   * GOOD: DataLoader — batches individual lookups into one IN query each.
   *
   * Query 1: SELECT * FROM products WHERE isActive = true LIMIT 20
   * Query 2: SELECT * FROM reviews WHERE productId IN ('p1','p2',...,'p20')
   *
   * Total: 2 queries. DataLoader deduplicates IDs and batches automatically.
   */
  @Get('good-dataloader')
  @HttpCode(HttpStatus.OK)
  async goodDataLoaderApproach() {
    this.resetCounters();

    // Query 1: fetch 20 product IDs
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    // Load products through DataLoader (batched by ID)
    const loadedProducts = await Promise.all(
      products.map((p) => this.productLoader.load(p.id)),
    );

    // Load reviews through DataLoader (batched by productId)
    const reviewsPerProduct = await Promise.all(
      products.map((p) => this.reviewLoader.load(p.id)),
    );

    // Combine results
    const results = loadedProducts.map((product, i) => ({
      ...product,
      reviews: reviewsPerProduct[i],
    }));

    this.logger.log(`[GOOD-DATALOADER] ${this.queryCount} queries executed`);
    return {
      approach: 'DataLoader (GOOD)',
      queryCount: this.queryCount,
      products: results.length,
      queryLog: this.queryLog,
    };
  }

  /**
   * COMPARISON: runs all three approaches sequentially and returns
   * timing and query count for each. Useful for benchmarking.
   */
  @Get('comparison')
  @HttpCode(HttpStatus.OK)
  async comparison() {
    const results: ApproachResult[] = [];

    // Run each approach and collect metrics
    const approaches = [
      { name: 'N+1 (BAD)', fn: () => this.runBad() },
      { name: 'Prisma Include', fn: () => this.runInclude() },
      { name: 'DataLoader', fn: () => this.runDataLoader() },
    ];

    for (const approach of approaches) {
      this.resetCounters();
      const start = performance.now();
      await approach.fn();
      const durationMs = performance.now() - start;

      results.push({
        approach: approach.name,
        queryCount: this.queryCount,
        durationMs: Math.round(durationMs * 100) / 100,
        queryLog: [...this.queryLog],
      });
    }

    return {
      summary: results.map((r) => ({
        approach: r.approach,
        queries: r.queryCount,
        durationMs: r.durationMs,
      })),
      details: results,
    };
  }

  private resetCounters(): void {
    this.queryLog = [];
    this.queryCount = 0;
  }

  private async runBad(): Promise<void> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      take: 20,
    });
    for (const product of products) {
      await this.prisma.review.findMany({
        where: { productId: product.id },
      });
    }
  }

  private async runInclude(): Promise<void> {
    await this.prisma.product.findMany({
      where: { isActive: true },
      take: 20,
      include: { reviews: true },
    });
  }

  private async runDataLoader(): Promise<void> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      take: 20,
      select: { id: true },
    });
    await Promise.all(products.map((p) => this.productLoader.load(p.id)));
    await Promise.all(products.map((p) => this.reviewLoader.load(p.id)));
  }
}
