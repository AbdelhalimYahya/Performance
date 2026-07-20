import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';

export interface AnalyticsJobData {
  event: string;
  userId: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

@Processor('analytics')
export class AnalyticsProcessor {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  @Process({ name: 'track', concurrency: 10 })
  async handleTrack(job: Job<AnalyticsJobData>) {
    // High concurrency for lightweight analytics events
    this.logger.debug(`Analytics: ${job.data.event}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { tracked: true };
  }
}
