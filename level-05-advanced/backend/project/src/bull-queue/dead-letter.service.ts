import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

/**
 * DEAD LETTER QUEUE PROCESSOR
 *
 * Failed jobs from other queues are routed here for:
 * 1. Inspection — see what failed and why
 * 2. Manual retry — re-enqueue to original queue
 * 3. Alerting — trigger notifications for critical failures
 * 4. Audit trail — keep records for compliance
 */
@Processor('dead-letter')
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    @InjectQueue('email') private emailQueue: Queue,
    @InjectQueue('pdf') private pdfQueue: Queue,
  ) {}

  @Process('failed-email')
  async handleFailedEmail(job: Job) {
    this.logger.warn(`Dead letter: email to ${job.data.to} — ${job.data.error}`);
    // In production: send to monitoring, store in DB, trigger alert
    return { logged: true };
  }

  /**
   * Manual retry: move a dead-lettered job back to its original queue.
   * Useful for transient failures (network timeout, rate limit).
   */
  async retryJob(jobData: Record<string, unknown>, queueName: 'email' | 'pdf') {
    const queue = queueName === 'email' ? this.emailQueue : this.pdfQueue;
    await queue.add(queueName === 'email' ? 'send' : 'generate', jobData, {
      attempts: 1, // No retries on manual retry
    });
    this.logger.log(`Retried job on ${queueName} queue`);
  }
}
