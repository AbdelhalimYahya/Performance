/**
 * DataLoader Module — REQUEST-scoped providers for DataLoader instances.
 *
 * WHY REQUEST-SCOPED?
 * DataLoader has an in-memory cache. If a DataLoader were singleton,
 * the cache would persist across HTTP requests → stale data.
 *
 * By making it request-scoped:
 * - Each request gets fresh DataLoader instances
 * - Cache lives only for the duration of one request
 * - After the request completes, instances are garbage collected
 *
 * Provides:
 * - ProductDataLoader: batches product lookups by ID
 * - ReviewDataLoader: batches review lookups by productId
 *
 * Exports both so other modules (controllers, services) can inject them.
 */
import { Module, Scope } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ProductDataLoader } from './product.dataloader';
import { ReviewDataLoader } from './review.dataloader';

@Module({
  providers: [
    // REQUEST scope: new instance per HTTP request (cache is per-request)
    {
      provide: ProductDataLoader,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService) => new ProductDataLoader(prisma),
      inject: [PrismaService],
    },
    {
      provide: ReviewDataLoader,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService) => new ReviewDataLoader(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [ProductDataLoader, ReviewDataLoader],
})
export class DataLoaderModule {}
