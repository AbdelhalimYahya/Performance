import { Process, Processor, OnQueueFailed, OnQueueCompleted, OnQueueStalled } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';

/**
 * EMAIL PROCESSOR
 *
 * Handles 3 types of email jobs:
 * - welcome-email: single email, 500ms simulated delay
 * - password-reset: single email with idempotency check
 * - bulk-newsletter: batch processing with progress updates
 *
 * Concurrency: default (1) — emails are sent sequentially to respect
 * SMTP rate limits and avoid being flagged as spam.
 *
 * Idempotency: password-reset checks if job was already processed.
 * If Bull retries a stalled job, we don't send the email twice.
 */

interface WelcomeEmailData {
  userId: string;
  email: string;
  name: string;
}

interface PasswordResetData {
  userId: string;
  email: string;
  resetToken: string;
}

interface NewsletterData {
  recipients: string[];
  subject: string;
  templateId: string;
}

@Processor('emails')
export class EmailProcessor implements OnQueueFailed, OnQueueCompleted, OnQueueStalled {
  private readonly logger = new Logger(EmailProcessor.name);

  @Process('welcome-email')
  async handleWelcomeEmail(job: Job<WelcomeEmailData>) {
    this.logger.log(`Sending welcome email to ${job.data.email} (job ${job.id})`);

    // Simulate SMTP send delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    this.logger.log(`Welcome email sent to ${job.data.email}`);
    return { sent: true, recipient: job.data.email };
  }

  /**
   * Password reset with idempotency check.
   * If Bull retries a stalled job, we check if the email was already sent.
   * In production: check a "sent" flag in Redis or database.
   */
  @Process('password-reset')
  async handlePasswordReset(job: Job<PasswordResetData>) {
    const idempotencyKey = `password-reset:${job.data.userId}:${job.id}`;

    // Simulate idempotency check (in production: Redis SETNX)
    const alreadyProcessed = false; // Would check Redis in production
    if (alreadyProcessed) {
      this.logger.warn(`Password reset already sent for user ${job.data.userId}, skipping`);
      return { sent: false, reason: 'idempotent_skip' };
    }

    this.logger.log(`Sending password reset to ${job.data.email}`);
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Mark as sent (in production: Redis SET with TTL)
    this.logger.log(`Password reset sent to ${job.data.email}`);
    return { sent: true, recipient: job.data.email };
  }

  /**
   * Bulk newsletter: process recipients in batches of 100.
   * Reports progress to Bull dashboard for visibility.
   *
   * Why batch: sending 1000 emails at once would overwhelm SMTP.
   * Batches of 100 with small delays between batches.
   */
  @Process('bulk-newsletter')
  async handleBulkNewsletter(job: Job<NewsletterData>) {
    const { recipients, subject, templateId } = job.data;
    const batchSize = 100;
    const totalBatches = Math.ceil(recipients.length / batchSize);

    this.logger.log(`Starting newsletter to ${recipients.length} recipients (${totalBatches} batches)`);

    for (let i = 0; i < totalBatches; i++) {
      const batch = recipients.slice(i * batchSize, (i + 1) * batchSize);

      // Simulate sending batch
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Report progress as percentage
      const progress = Math.round(((i + 1) / totalBatches) * 100);
      await job.progress(progress);

      this.logger.log(`Newsletter batch ${i + 1}/${totalBatches} sent (${progress}%)`);
    }

    return {
      sent: recipients.length,
      templateId,
      subject,
    };
  }

  /**
   * Log failure with full context for debugging.
   * Includes job data, error message, attempt number, and next retry time.
   */
  async onQueueFailed(job: Job, error: Error) {
    const nextRetryAt = job.opts.delay
      ? new Date(Date.now() + (job.opts.delay as number)).toISOString()
      : 'none';

    this.logger.error(
      `Email job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts})`,
      {
        jobId: job.id,
        type: job.name,
        data: job.data,
        error: error.message,
        attemptsMade: job.attemptsMade,
        nextRetryAt,
        timestamp: new Date().toISOString(),
      },
    );
  }

  /**
   * Log success with timing information.
   * Tracks total duration from job creation to completion.
   */
  async onQueueCompleted(job: Job, result: any) {
    const durationMs = Date.now() - job.timestamp;
    this.logger.log(
      `Email job ${job.id} (${job.name}) completed in ${durationMs}ms`,
      { jobId: job.id, type: job.name, durationMs, result },
    );
  }

  /**
   * Stalled = job took too long and was re-queued by Bull.
   * Default stall interval: 30s. If a job doesn't call progress() or
   * complete() within 30s, Bull considers it stalled.
   */
  async onQueueStalled(job: Job) {
    this.logger.warn(
      `Email job ${job.id} stalled — timed out and re-queued`,
      { jobId: job.id, type: job.name, data: job.data },
    );
  }
}
