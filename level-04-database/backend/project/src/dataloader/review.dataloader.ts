/**
 * Review DataLoader — batches review lookups by product ID.
 *
 * Batch function: receives an array of product IDs, runs one Prisma query
 * WHERE productId IN (...), then groups results by productId.
 *
 * Returns empty array [] for products with no reviews (never null).
 * This ensures consumers can always iterate safely.
 *
 * Data flow:
 *   load('p1') ┐
 *   load('p2') ┤→ batchFn(['p1','p2'])
 *   load('p3') ┘   → SELECT * FROM reviews WHERE productId IN ('p1','p2','p3')
 *                   → groupBy productId
 *                   → [reviews_for_p1, reviews_for_p2, reviews_for_p3]
 */
import DataLoader from 'dataloader';
import { PrismaService } from '../database/prisma.service';

export interface Review {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  content: string;
  createdAt: Date;
}

export class ReviewDataLoader extends DataLoader<string, Review[]> {
  constructor(prisma: PrismaService) {
    super(
      async (productIds: readonly string[]): Promise<Review[][]> => {
        // Single batch query — replaces N individual queries
        const reviews = await prisma.review.findMany({
          where: { productId: { in: [...productIds] } },
          orderBy: { createdAt: 'desc' },
        });

        // Group reviews by productId for order-preserving return
        const reviewsByProduct = new Map<string, Review[]>();

        for (const review of reviews) {
          const existing = reviewsByProduct.get(review.productId);
          if (existing) {
            existing.push(review);
          } else {
            reviewsByProduct.set(review.productId, [review]);
          }
        }

        // Return in SAME ORDER as input productIds
        // Empty array for products with no reviews (never null)
        return productIds.map(
          (id) => reviewsByProduct.get(id) ?? [],
        );
      },
      {
        cache: true,
        maxBatchSize: 100,
      },
    );
  }
}
