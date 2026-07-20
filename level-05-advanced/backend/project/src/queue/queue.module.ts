import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { EmailProcessor } from './processors/email.processor';
import { ReportProcessor } from './processors/report.processor';
import { ImageProcessor } from './processors/image.processor';
import { QueueController } from './queue.controller';
import { QueueMonitorService } from './queue-monitor.service';

/**
 * QUEUE MODULE
 *
 * Production-grade async job processing with 5 isolated queues.
 * Each queue has its own Redis key prefix to prevent starvation.
 *
 * Redis connection: reads REDIS_URL from ConfigService (env variable).
 * In production: use Redis Cluster or Redis Sentinel for HA.
 *
 * Queue isolation prevents one queue's backlog from starving another.
 * For example, a burst of newsletter emails won't delay PDF generation.
 *
 * Default job options (per-queue):
 * - attempts: 3 — retry up to 3 times before moving to failed state
 * - backoff: exponential starting at 2s (2s, 4s, 8s between retries)
 * - removeOnComplete: 100 — keep last 100 completed jobs for debugging
 * - removeOnFail: 1000 — keep last 1000 failed jobs for analysis
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD', undefined),
          maxRetriesPerRequest: null, // Required by Bull
          enableReadyCheck: false,
        },
      }),
    }),
    BullModule.registerQueue(
      {
        name: 'emails',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      },
      {
        name: 'reports',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      },
      {
        name: 'image-processing',
        defaultJobOptions: {
          attempts: 2, // Image ops are expensive, fewer retries
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 50,
          removeOnFail: 500,
        },
      },
      {
        name: 'notifications',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 200,
          removeOnFail: 1000,
        },
      },
      {
        name: 'cleanup',
        defaultJobOptions: {
          attempts: 1, // Cleanup is idempotent, no retry needed
          removeOnComplete: 10,
          removeOnFail: 50,
        },
      },
    ),
  ],
  controllers: [QueueController],
  providers: [EmailProcessor, ReportProcessor, ImageProcessor, QueueMonitorService],
  exports: [BullModule],
})
export class QueueModule {}
