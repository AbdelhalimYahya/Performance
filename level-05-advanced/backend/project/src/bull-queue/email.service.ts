import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EmailJobData } from './email.processor';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@InjectQueue('email') private emailQueue: Queue) {}

  /**
   * Add email to queue with priority-based ordering.
   *
   * Priority levels:
   * - high (1): transactional emails (password reset, 2FA codes)
   * - normal (2): notifications
   * - low (3): newsletters, marketing
   *
   * Attempts: 3 total (initial + 2 retries)
   * Backoff: exponential starting at 2s (2s, 4s, 8s)
   * removeOnComplete: keep last 100 completed jobs in Redis
   * removeOnFail: keep last 50 failed jobs for debugging
   */
  async sendEmail(data: EmailJobData) {
    const priorityMap = { high: 1, normal: 2, low: 3 };

    const job = await this.emailQueue.add('send', data, {
      priority: priorityMap[data.priority],
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`Email queued: job ${job.id} to ${data.to} (priority: ${data.priority})`);
    return { jobId: job.id, status: 'queued' };
  }

  /**
   * Delayed email: schedule for future delivery.
   * Bull stores the job in a Redis sorted set with timestamp score.
   */
  async scheduleEmail(data: EmailJobData, delayMs: number) {
    const job = await this.emailQueue.add('send', data, {
      delay: delayMs,
      priority: 2,
    });
    return { jobId: job.id, scheduledFor: new Date(Date.now() + delayMs).toISOString() };
  }

  /**
   * Repeated email: cron-like scheduling.
   * Bull Scheduler checks for due jobs every second.
   */
  async scheduleRecurring(data: EmailJobData, cronExpression: string) {
    const job = await this.emailQueue.add('send', data, {
      repeat: { cron: cronExpression },
      removeOnComplete: true,
    });
    return { jobId: job.id, cron: cronExpression };
  }

  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.emailQueue.getWaitingCount(),
      this.emailQueue.getActiveCount(),
      this.emailQueue.getCompletedCount(),
      this.emailQueue.getFailedCount(),
      this.emailQueue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  }
}
