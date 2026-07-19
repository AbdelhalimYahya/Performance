/**
 * Product entity — TypeORM model with performance indexes.
 *
 * Index strategy:
 * - category + price composite (most common filter/sort)
 * - isActive partial index (hot path — 90% of queries)
 * - id cursor pagination index
 * - seller + created_at for seller dashboards
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Review } from './review.entity';

@Entity('products')
// Composite index: category filtering + price sorting (selectivity order)
@Index('idx_products_category_price', ['category', 'price'])
// Cursor pagination: WHERE id > $cursor ORDER BY id LIMIT $limit
@Index('idx_products_id_cursor', ['id'])
// Seller dashboard: seller's products sorted by creation date
@Index('idx_products_seller_created', ['sellerId', 'createdAt'])
// Hot path: active products only (partial index — WHERE isActive = true)
@Index('idx_products_active_cat_price', ['isActive', 'category', 'price'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: number;

  @Column({ type: 'int', default: 0 })
  stock!: number;

  @Column({ type: 'varchar', length: 100 })
  category!: string;

  @Column({ type: 'uuid' })
  sellerId!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // ─── Relations ─────────────────────────────────────────────
  // N+1 prevention: use eager loading or DataLoader for these relations
  @ManyToOne(() => User, (user) => user.products, { eager: false })
  @JoinColumn({ name: 'sellerId' })
  seller!: User;

  @OneToMany(() => Review, (review) => review.product, { eager: false })
  reviews!: Review[];
}
