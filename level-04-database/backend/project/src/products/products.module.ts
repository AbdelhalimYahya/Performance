/**
 * Products module — TypeORM-backed product management with performance patterns.
 *
 * Exposes:
 * - Product CRUD with optimized queries
 * - N+1 prevention via eager loading and DataLoader
 * - Covering index queries
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { User } from './user.entity';
import { Review } from './review.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, User, Review])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
