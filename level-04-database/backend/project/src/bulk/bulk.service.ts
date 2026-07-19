/**
 * Bulk service — efficient bulk database operations.
 *
 * Key principle: minimize round trips to the database.
 * One query inserting 10,000 rows is 100x faster than 10,000 individual INSERTs.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product } from '../products/product.entity';

@Injectable()
export class BulkService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  // ─── Bulk INSERT with Single Query ─────────────────────────
  // Inserts multiple rows in one INSERT statement.
  // PostgreSQL processes one statement instead of N, reducing network round trips.
  async bulkInsert(
    products: Array<{
      name: string;
      price: number;
      category: string;
      sellerId: string;
    }>,
  ): Promise<{ inserted: number }> {
    const batchSize = 1000; // PostgreSQL has a limit on parameter count
    let inserted = 0;

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      await this.productRepo
        .createQueryBuilder()
        .insert()
        .values(batch)
        .execute();
      inserted += batch.length;
    }

    return { inserted };
  }

  // ─── Bulk UPDATE with VALUES List ──────────────────────────
  // Updates multiple rows in one query using a VALUES list join.
  // Instead of N UPDATE queries, runs one UPDATE with a CASE expression.
  async bulkUpdate(
    updates: Array<{ id: string; price: number }>,
  ): Promise<{ updated: number }> {
    if (updates.length === 0) return { updated: 0 };

    // Build UPDATE ... FROM (VALUES ...) AS v(id, price) WHERE p.id = v.id::uuid
    const values = updates
      .map((u) => `('${u.id}', ${u.price})`)
      .join(', ');

    await this.productRepo.query(`
      UPDATE products AS p
      SET price = v.price::numeric
      FROM (VALUES ${values}) AS v(id, price)
      WHERE p.id = v.id::uuid
    `);

    return { updated: updates.length };
  }

  // ─── Bulk DELETE with ANY ──────────────────────────────────
  // Deletes multiple rows by ID array in one query.
  // Uses PostgreSQL ANY() with an array — efficient for large ID lists.
  async bulkDelete(ids: string[]): Promise<{ deleted: number }> {
    if (ids.length === 0) return { deleted: 0 };

    const result = await this.productRepo
      .createQueryBuilder()
      .delete()
      .where('id = ANY(:ids)', { ids })
      .execute();

    return { deleted: result.affected ?? 0 };
  }

  // ─── Bulk INSERT with INSERT ... SELECT ────────────────────
  // Generates test data directly in the database.
  // No data transfer between app and database — fastest way to seed.
  async generateTestData(
    count: number,
    category: string,
  ): Promise<{ generated: number }> {
    await this.productRepo.query(`
      INSERT INTO products (name, price, category, stock, "isActive", "sellerId", "createdAt", "updatedAt")
      SELECT
        'Product ' || g || ' — ${category}',
        (random() * 500 + 5)::numeric(10,2),
        '${category}',
        (random() * 1000)::int,
        true,
        (SELECT id FROM users WHERE role = 'seller' LIMIT 1),
        NOW() - (random() * INTERVAL '365 days'),
        NOW()
      FROM generate_series(1, ${count}) g
    `);

    return { generated: count };
  }
}
