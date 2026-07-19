/**
 * Product DataLoader — batches individual product lookups into one Prisma query.
 *
 * Without DataLoader:
 *   productLoader.load('p1') → SELECT * FROM products WHERE id = 'p1'
 *   productLoader.load('p2') → SELECT * FROM products WHERE id = 'p2'
 *   ... N separate queries
 *
 * With DataLoader:
 *   productLoader.load('p1')  ┐
 *   productLoader.load('p2')  ┤→ batchFn(['p1','p2'])
 *   productLoader.load('p3')  ┘   → SELECT * FROM products WHERE id IN ('p1','p2','p3')
 *                                   → returns [product1, product2, product3]
 *
 * CRITICAL: batchFn must return results in the SAME ORDER as input IDs.
 * If an ID is not found, return an Error object (not null) for that slot.
 */
import DataLoader from 'dataloader';
import { PrismaService } from '../database/prisma.service';

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ProductDataLoader extends DataLoader<string, Product> {
  constructor(prisma: PrismaService) {
    super(
      async (ids: readonly string[]): Promise<(Product | Error)[]> => {
        // Single batch query — replaces N individual queries
        const products = await prisma.product.findMany({
          where: { id: { in: [...ids] } },
        });

        // Build lookup map for O(1) access
        const productMap = new Map(products.map((p) => [p.id, p]));

        // Return results in SAME ORDER as input IDs (DataLoader contract)
        // If ID not found, return Error (DataLoader will reject that promise)
        return ids.map(
          (id) =>
            productMap.get(id) ??
            new Error(`Product ${id} not found in batch`),
        );
      },
      {
        cache: true, // Same product ID in same request → cache hit, no extra query
        maxBatchSize: 100, // PostgreSQL IN clause limit safety
      },
    );
  }
}
