/**
 * Replication module — read/write splitting for PostgreSQL replicas.
 *
 * Pattern:
 * - Writes go to primary (master) — guaranteed consistency
 * - Reads go to replicas — load-balanced, reduced primary load
 * - Use TypeORM's replication config or custom decorator for explicit routing
 *
 * When to use replicas:
 * - Read-heavy workloads (>80% reads)
 * - Reporting/analytics queries that run long
 * - Geographic distribution (replica in each region)
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/product.entity';
import { ReplicationController } from './replication.controller';
import { ReplicationService } from './replication.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [ReplicationController],
  providers: [ReplicationService],
  exports: [ReplicationService],
})
export class ReplicationModule {}
