import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';

/**
 * IMAGE PROCESSOR
 *
 * Concurrency: 4 — processes 4 images simultaneously.
 * Image operations are I/O-bound (disk read/write) + CPU-bound (resize).
 * Concurrency of 4 balances throughput without overwhelming the CPU.
 *
 * Why not higher concurrency:
 * - Each resize uses CPU for pixel interpolation
 * - 4 concurrent resizes on a 4-core machine = 100% CPU
 * - Higher concurrency just adds context switching overhead
 *
 * Thumbnail strategy:
 * - Generate 4 sizes: 150px, 300px, 600px, 1200px
 * - Each thumbnail is a separate resize operation
 * - In production: use sharp (C++ addon) for native performance
 */

interface ResizeData {
  imagePath: string;
  width: number;
  height: number;
  quality?: number;
}

interface OptimizeData {
  imagePath: string;
  outputPath: string;
  format: 'webp' | 'avif' | 'jpeg';
  quality: number;
}

interface ThumbnailData {
  imagePath: string;
  sizes: number[];
}

@Processor('image-processing')
export class ImageProcessor {
  private readonly logger = new Logger(ImageProcessor.name);

  @Process('resize')
  async handleResize(job: Job<ResizeData>) {
    const start = performance.now();
    const { imagePath, width, height, quality = 80 } = job.data;

    this.logger.log(`Resizing ${imagePath} to ${width}x${height}`);

    // Simulate resize operation
    await new Promise((resolve) => setTimeout(resolve, 200));

    const durationMs = performance.now() - start;
    this.logger.log(`Resized ${imagePath} in ${durationMs.toFixed(1)}ms`);

    return {
      outputPath: `${imagePath}-${width}x${height}.resized`,
      width,
      height,
      durationMs,
    };
  }

  @Process('optimize')
  async handleOptimize(job: Job<OptimizeData>) {
    const start = performance.now();
    const { imagePath, outputPath, format, quality } = job.data;

    this.logger.log(`Optimizing ${imagePath} → ${format} (quality=${quality})`);

    // Simulate compression
    await new Promise((resolve) => setTimeout(resolve, 300));

    const originalSize = 1024 * 500; // Simulated 500KB original
    const optimizedSize = Math.round(originalSize * (quality / 100) * 0.6);
    const reduction = ((1 - optimizedSize / originalSize) * 100).toFixed(1);

    const durationMs = performance.now() - start;
    this.logger.log(`Optimized: ${reduction}% reduction (${originalSize} → ${optimizedSize} bytes)`);

    return {
      outputPath,
      originalSize,
      optimizedSize,
      reductionPercent: parseFloat(reduction),
      format,
      durationMs,
    };
  }

  /**
   * Generate multiple thumbnail sizes from a single source image.
   * Processes sizes sequentially to avoid memory spikes.
   * In production: use sharp's resize pipeline for efficiency.
   */
  @Process('generate-thumbnails')
  async handleThumbnails(job: Job<ThumbnailData>) {
    const { imagePath, sizes } = job.data;
    this.logger.log(`Generating ${sizes.length} thumbnails from ${imagePath}`);

    const results: Array<{ size: number; path: string; durationMs: number }> = [];

    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i];
      const start = performance.now();

      // Simulate thumbnail generation
      await new Promise((resolve) => setTimeout(resolve, 100));

      results.push({
        size,
        path: `${imagePath}-${size}px.webp`,
        durationMs: performance.now() - start,
      });

      await job.progress(Math.round(((i + 1) / sizes.length) * 100));
    }

    this.logger.log(`Generated ${results.length} thumbnails`);
    return { thumbnails: results };
  }
}
