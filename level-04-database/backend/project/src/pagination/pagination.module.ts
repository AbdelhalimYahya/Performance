/**
 * Pagination module — cursor-based pagination for large datasets.
 *
 * Why cursor-based over OFFSET:
 * - OFFSET scans and discards rows: slow at high page numbers
 * - Cursor uses index seek: O(log n) regardless of page depth
 * - Cursor pagination is stable under concurrent inserts/deletes
 *
 * Cursor encoding:
 * - Simple: base64 of the ID
 * - Composite: base64 of { createdAt, id } for multi-column sorts
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/product.entity';
import { PaginationController } from './pagination.controller';
import { PaginationService } from './pagination.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [PaginationController],
  providers: [PaginationService],
  exports: [PaginationService],
})
export class PaginationModule {}
