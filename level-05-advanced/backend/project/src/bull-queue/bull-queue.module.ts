import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { EmailProcessor } from './email.processor';
import { EmailService } from './email.service';
import { PdfProcessor } from './pdf.processor';
import { AnalyticsProcessor } from './analytics.processor';
import { DeadLetterService } from './dead-letter.service';
import { QueueController } from './queue.controller';

/**
 * BULL QUEUE MODULE
 *
 * Bull uses Redis for job storage and distribution across workers.
 * Each queue has: producers (add jobs), processors (consume jobs), and
 * optional schedulers (delayed/repeated jobs).
 *
 * Queue isolation: each queue has its own Redis key prefix.
 * This prevents one queue's backlog from starving another.
 *
 * Concurrency: per-processor concurrency (not per-queue).
 * A processor with concurrency=5 runs 5 jobs in parallel.
 */
@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        maxRetriesPerRequest: null, // Required by Bull
      },
    }),
    BullModule.registerQueue(
      { name: 'email', defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } } },
      { name: 'pdf' },
      { name: 'analytics' },
      { name: 'dead-letter' },
    ),
  ],
  controllers: [QueueController],
  providers: [EmailProcessor, EmailService, PdfProcessor, AnalyticsProcessor, DeadLetterService],
  exports: [EmailService],
})
export class BullQueueModule {}
