/**
 * Root application module — configures database connections and feature modules.
 *
 * Database setup:
 * - TypeORM with connection pooling (min: 5, max: 20)
 * - Prisma client for ORM demos
 * - Read replica routing example
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from './products/products.module';
import { DataLoaderModule } from './dataloader/dataloader.module';
import { PaginationModule } from './pagination/pagination.module';
import { ReplicationModule } from './replication/replication.module';
import { BulkModule } from './bulk/bulk.module';
import { StatsController } from './stats.controller';

@Module({
  imports: [
    // ─── TypeORM Configuration ──────────────────────────────
    // Connection pool tuned for 4-core server: (4 × 2) + 1 = 9, rounded to 20 for headroom
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'perf_database',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: false, // never use synchronize in production
      poolSize: 20,
      extra: {
        min: 5,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      },
    }),

    ProductsModule,
    DataLoaderModule,
    PaginationModule,
    ReplicationModule,
    BulkModule,
  ],
  controllers: [StatsController],
})
export class AppModule {}
