/**
 * Bulk module — demonstrates efficient bulk database operations.
 *
 * Patterns:
 * - INSERT ... SELECT for bulk data generation
 * - Batch INSERT with single query
 * - Bulk UPDATE with VALUES list
 * - Bulk DELETE with ANY array
 *
 * Performance difference:
 * - Individual INSERT: 10,000 queries × 2ms = 20 seconds
 * - Bulk INSERT (1000 batches): 10 queries × 50ms = 0.5 seconds
 * - Single INSERT ... SELECT: 1 query × 500ms = 0.5 seconds
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/product.entity';
import { BulkController } from './bulk.controller';
import { BulkService } from './bulk.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [BulkController],
  providers: [BulkService],
  exports: [BulkService],
})
export class BulkModule {}
