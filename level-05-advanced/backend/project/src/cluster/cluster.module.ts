import { Module } from '@nestjs/common';
import { ClusterStatsService } from './cluster-stats.service';
import { ClusterController } from './cluster.controller';

/**
 * CLUSTER MODULE
 *
 * Provides cluster health monitoring and worker management.
 * Import in AppModule to enable /cluster/* endpoints.
 *
 * The ClusterStatsService collects heartbeat data from workers.
 * In primary process: receives IPC messages, updates stats Map.
 * In worker process: stats are local (this worker only).
 */
@Module({
  controllers: [ClusterController],
  providers: [ClusterStatsService],
  exports: [ClusterStatsService],
})
export class ClusterModule {}
