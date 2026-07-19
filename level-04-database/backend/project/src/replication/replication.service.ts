/**
 * Replication service — demonstrates read/write routing.
 *
 * In production, TypeORM is configured with replication:
 * ```typescript
 * TypeOrmModule.forRoot({
 *   type: 'postgres',
 *   replication: {
 *     master: { host: 'primary-db', ... },
 *     slaves: [
 *       { host: 'replica-1', ... },
 *       { host: 'replica-2', ... },
 *     ],
 *   },
 * });
 * ```
 *
 * Routing rules:
 * - SELECT → replica (load-balanced)
 * - INSERT/UPDATE/DELETE → primary (consistency required)
 * - SELECT FOR UPDATE → primary (needs row lock)
 *
 * This service simulates the routing for educational purposes.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/product.entity';

@Injectable()
export class ReplicationService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  // ─── Read from Replica ─────────────────────────────────────
  // In production with replication config, TypeORM auto-routes reads to replicas.
  // Here we use a raw query to demonstrate the concept.
  async readFromReplica(category: string): Promise<Product[]> {
    // TypeORM would route this to a replica automatically
    // Using query builder to show the read path
    return this.productRepo
      .createQueryBuilder('p')
      .where('p.category = :category', { category })
      .andWhere('p.isActive = :isActive', { isActive: true })
      .orderBy('p.createdAt', 'DESC')
      .take(50)
      .getMany();
  }

  // ─── Write to Primary ──────────────────────────────────────
  // In production, all writes go to primary.
  // This ensures consistency — replicas receive the data via WAL streaming.
  async writeToPrimary(data: Partial<Product>): Promise<Product> {
    const product = this.productRepo.create(data);
    return this.productRepo.save(product);
  }

  // ─── Read-after-Write Consistency ──────────────────────────
  // After a write, reads should go to primary until replica catches up.
  // Strategy: force primary read for a short time after write.
  async writeThenRead(data: Partial<Product>): Promise<Product> {
    const saved = await this.writeToPrimary(data);

    // Force primary read (bypass replica) for consistency
    // In TypeORM, you can use a custom query with master hint
    return this.productRepo.findOne({
      where: { id: saved.id },
    }) as Promise<Product>;
  }

  // ─── Replica Lag Monitoring ────────────────────────────────
  // Check how far behind a replica is from primary.
  // Use this to decide when to route reads to replicas.
  async checkReplicaLag(): Promise<{ lagMs: number }> {
    // In production: SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) * 1000
    // This simulates the check
    return { lagMs: 0 };
  }
}
