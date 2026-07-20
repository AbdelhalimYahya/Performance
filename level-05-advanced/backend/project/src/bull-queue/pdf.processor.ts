import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';

export interface PdfJobData {
  templateId: string;
  data: Record<string, unknown>;
  outputPath: string;
}

@Processor('pdf')
export class PdfProcessor {
  private readonly logger = new Logger(PdfProcessor.name);

  @Process({ name: 'generate', concurrency: 2 })
  async handleGenerate(job: Job<PdfJobData>) {
    this.logger.log(`Generating PDF: ${job.data.templateId}`);

    // Simulate PDF generation (CPU-intensive — good candidate for worker thread)
    await new Promise((resolve) => setTimeout(resolve, 500));

    return { path: job.data.outputPath, size: 1024 * 100 };
  }
}
