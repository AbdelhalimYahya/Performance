/**
 * Review entity — TypeORM model for product reviews.
 *
 * Indexes:
 * - productId + createdAt (N+1 prevention — load reviews per product)
 * - userId + createdAt (user review history)
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';
import { User } from './user.entity';

@Entity('reviews')
@Index('idx_reviews_product_created', ['productId', 'createdAt'])
@Index('idx_reviews_user_created', ['userId', 'createdAt'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'uuid' })
  productId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Product, (product) => product.reviews)
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @ManyToOne(() => User, (user) => user.reviews)
  @JoinColumn({ name: 'userId' })
  user!: User;
}
