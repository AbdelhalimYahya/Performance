import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';

/**
 * EMAIL JOB DATA SCHEMA
 *
 * Typed interface for job data ensures type safety across producers and consumers.
 * Bull serializes job data to Redis (JSON), so no functions or class instances allowed.
 */
export interface EmailJobData {
  to: string;
  subject: string;
  body: string;
  template: 'welcome' | 'reset-password' | 'notification';
  priority: 'low' | 'normal' | 'high';
  retryCount?: number;
}

/**
 * EMAIL PROCESSOR
 *
 * Processes email jobs from the 'email' queue.
 * Concurrency=5 means 5 emails are sent in parallel per worker.
 *
 * Backoff strategy (from queue config):
 * - attempt 1: immediate
 * - attempt 2: 2s delay
 * - attempt 3: 4s delay (exponential)
 *
 * After 3 failures, OnQueueFailed moves the job to the dead-letter queue.
 */
@Processor('email')
export class EmailProcessor implements OnQueueFailed {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(@InjectQueue('dead-letter') private deadLetterQueue: Queue) {}

  @Process({ name: 'send', concurrency: 5 })
  async handleSend(job: Job<EmailJobData>) {
    this.logger.log(`Processing email to ${job.data.to} (attempt ${job.attemptsMade + 1})`);

    // Simulate email sending (replace with real SMTP/API call)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simulate occasional failures for demo
    if (Math.random() < 0.05) {
      throw new Error('SMTP connection timeout');
    }

    return { sent: true, to: job.data.to, timestamp: new Date().toISOString() };
  }

  /**
   * Dead letter queue: after all retries exhausted, move failed jobs
   * to a separate queue for inspection and manual retry.
   */
  async onQueueFailed(job: Job, error: Error) {
    this.logger.error(`Email job ${job.id} failed permanently: ${error.message}`);
    await this.deadLetterQueue.add('failed-email', {
      ...job.data,
      error: error.message,
      failedAt: new Date().toISOString(),
      attempts: job.attemptsMade,
    });
  }
}
