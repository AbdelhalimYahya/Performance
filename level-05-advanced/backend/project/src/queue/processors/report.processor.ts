import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';

/**
 * REPORT PROCESSOR
 *
 * Handles CPU-intensive report generation in background.
 * Why use a queue instead of awaiting inline:
 * - PDF generation takes ~5s — blocks HTTP handler, user stares at spinner
 * - Excel generation writes to disk — slow, I/O-bound
 * - Analytics aggregation processes 100K+ records — CPU-bound
 *
 * With a queue: HTTP handler returns { jobId } immediately.
 * Client polls GET /queue/job/:queueName/:jobId for status.
 * Worker processes in background, reports progress via job.progress().
 */

interface PdfReportData {
  templateId: string;
  data: Record<string, unknown>;
  userId: string;
}

interface ExcelReportData {
  query: string;
  userId: string;
  format: 'xlsx' | 'csv';
}

interface AnalyticsData {
  startDate: string;
  endDate: string;
  metrics: string[];
}

@Processor('reports')
export class ReportProcessor {
  private readonly logger = new Logger(ReportProcessor.name);

  /**
   * PDF generation with progress updates every 500ms.
   * Simulates a real PDF library (puppeteer, pdfkit) rendering pages.
   */
  @Process('generate-pdf')
  async handlePdfGeneration(job: Job<PdfReportData>) {
    const { templateId, userId } = job.data;
    this.logger.log(`Generating PDF report ${templateId} for user ${userId}`);

    const totalSteps = 10;
    for (let i = 0; i < totalSteps; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await job.progress(Math.round(((i + 1) / totalSteps) * 100));
    }

    const filePath = `/tmp/reports/${job.id}-${templateId}.pdf`;
    this.logger.log(`PDF generated: ${filePath}`);

    return { filePath, templateId, sizeBytes: 1024 * 250 };
  }

  /**
   * Excel generation with streaming write.
   * In production: use exceljs with streaming mode to avoid holding
   * the entire workbook in memory.
   */
  @Process('generate-excel')
  async handleExcelGeneration(job: Job<ExcelReportData>) {
    const { query, userId, format } = job.data;
    this.logger.log(`Generating ${format.toUpperCase()} report for user ${userId}`);

    // Simulate streaming write to temp file
    const totalRows = 50_000;
    const batchSize = 5000;
    let written = 0;

    for (let i = 0; i < totalRows; i += batchSize) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      written = Math.min(i + batchSize, totalRows);
      await job.progress(Math.round((written / totalRows) * 100));
    }

    const filePath = `/tmp/reports/${job.id}-report.${format}`;
    this.logger.log(`Excel generated: ${filePath} (${written} rows)`);

    return { filePath, format, rowCount: written };
  }

  /**
   * Analytics aggregation — the primary reason to use a queue.
   * Processing 100K records with aggregations takes ~2-5s.
   * Doing this inline would block the HTTP handler.
   *
   * In a queue: HTTP returns immediately, aggregation runs in background.
   * Client polls for status, gets notified when complete.
   */
  @Process('analytics-aggregate')
  async handleAnalyticsAggregation(job: Job<AnalyticsData>) {
    const { startDate, endDate, metrics } = job.data;
    this.logger.log(`Aggregating analytics: ${startDate} to ${endDate}`);

    const totalRecords = 100_000;
    const batchSize = 10_000;
    const results: Record<string, number> = {};

    for (let i = 0; i < totalRecords; i += batchSize) {
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate aggregation computation
      for (const metric of metrics) {
        results[metric] = (results[metric] || 0) + Math.random() * 1000;
      }

      await job.progress(Math.round(((i + batchSize) / totalRecords) * 100));
    }

    // Round results
    for (const key of Object.keys(results)) {
      results[key] = Math.round(results[key] * 100) / 100;
    }

    this.logger.log(`Analytics aggregation complete: ${Object.keys(results).length} metrics`);

    return { metrics: results, recordCount: totalRecords };
  }
}
