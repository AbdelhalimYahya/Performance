/**
 * User entity — TypeORM model for users and sellers.
 *
 * Indexes:
 * - email unique (login/lookup)
 * - role + rating (admin dashboard queries)
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Product } from './product.entity';
import { Review } from './review.entity';

@Entity('users')
@Index('idx_users_role_rating', ['role', 'rating'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 50, default: 'user' })
  role!: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => Product, (product) => product.seller)
  products!: Product[];

  @OneToMany(() => Review, (review) => review.user)
  reviews!: Review[];
}
