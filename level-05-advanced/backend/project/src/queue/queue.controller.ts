import { Controller, Post, Get, Delete, Body, Param, InjectQueue } from '@nestjs/common';
import { Queue } from 'bull';

/**
 * QUEUE CONTROLLER
 *
 * REST API for managing background jobs.
 * Clients add jobs via POST and poll status via GET.
 *
 * Flow:
 * 1. Client POSTs to create job → returns { jobId } immediately
 * 2. Client polls GET /queue/job/:queueName/:jobId
 * 3. Status shows: waiting → active → completed/failed
 * 4. Progress field updates as job reports progress (0-100)
 */

@Controller('queue')
export class QueueController {
  constructor(
    @InjectQueue('emails') private emailQueue: Queue,
    @InjectQueue('reports') private reportQueue: Queue,
    @InjectQueue('image-processing') private imageQueue: Queue,
    @InjectQueue('notifications') private notificationQueue: Queue,
    @InjectQueue('cleanup') private cleanupQueue: Queue,
  ) {}

  /**
   * POST /queue/email/welcome
   * Adds a welcome email job. Returns jobId immediately.
   */
  @Post('email/welcome')
  async sendWelcomeEmail(@Body() body: { userId: string; email: string; name: string }) {
    const job = await this.emailQueue.add('welcome-email', body);
    return { jobId: job.id, status: 'queued', queue: 'emails' };
  }

  /**
   * POST /queue/email/newsletter
   * Adds bulk newsletter job with 1000 recipients.
   * The processor will batch them in groups of 100.
   */
  @Post('email/newsletter')
  async sendNewsletter(
    @Body() body: { subject: string; templateId: string; recipientCount?: number },
  ) {
    const count = body.recipientCount || 1000;
    const recipients = Array.from({ length: count }, (_, i) => `user${i}@example.com`);

    const job = await this.emailQueue.add('bulk-newsletter', {
      recipients,
      subject: body.subject,
      templateId: body.templateId,
    });

    return { jobId: job.id, status: 'queued', recipientCount: count };
  }

  /**
   * POST /queue/reports/pdf
   * Adds PDF generation job. Client polls for completion.
   */
  @Post('reports/pdf')
  async generatePdf(
    @Body() body: { templateId: string; data: Record<string, unknown>; userId: string },
  ) {
    const job = await this.reportQueue.add('generate-pdf', body);
    return {
      jobId: job.id,
      status: 'queued',
      pollUrl: `/queue/job/reports/${job.id}`,
    };
  }

  /**
   * GET /queue/job/:queueName/:jobId
   * Returns job status, progress, result, and failure info.
   */
  @Get('job/:queueName/:jobId')
  async getJobStatus(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
  ) {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      return { error: 'Job not found', queueName, jobId };
    }

    const state = await job.getState();
    return {
      jobId: job.id,
      queueName,
      state,
      progress: job.progress(),
      data: job.data,
      result: job.returnvalue || null,
      failReason: job.failedReason || null,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  /**
   * GET /queue/stats
   * Returns stats for all queues: waiting, active, completed, failed, delayed.
   */
  @Get('stats')
  async getQueueStats() {
    const queues = ['emails', 'reports', 'image-processing', 'notifications', 'cleanup'];
    const stats: Record<string, any> = {};

    for (const name of queues) {
      const queue = this.getQueue(name);
      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.isPaused(),
      ]);

      stats[name] = { waiting, active, completed, failed, delayed, paused };
    }

    return stats;
  }

  /**
   * POST /queue/simulate-failure
   * Adds a job that fails twice then succeeds on the 3rd attempt.
   * Demonstrates exponential backoff retry behavior.
   */
  @Post('simulate-failure')
  async simulateFailure() {
    const job = await this.emailQueue.add(
      'welcome-email',
      { userId: 'test', email: 'test@example.com', name: 'Test User' },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    return {
      jobId: job.id,
      status: 'queued',
      note: 'This job will fail twice then succeed — watch the retry logs',
    };
  }

  /**
   * DELETE /queue/:queueName/failed
   * Clears all failed jobs from the named queue.
   */
  @Delete(':queueName/failed')
  async clearFailedJobs(@Param('queueName') queueName: string) {
    const queue = this.getQueue(queueName);
    const failedJobs = await queue.getFailed(0, 1000);

    let cleared = 0;
    for (const job of failedJobs) {
      await job.remove();
      cleared++;
    }

    return { queueName, cleared };
  }

  private getQueue(name: string): Queue {
    const queues: Record<string, Queue> = {
      emails: this.emailQueue,
      reports: this.reportQueue,
      'image-processing': this.imageQueue,
      notifications: this.notificationQueue,
      cleanup: this.cleanupQueue,
    };
    const queue = queues[name];
    if (!queue) throw new Error(`Unknown queue: ${name}`);
    return queue;
  }
}
