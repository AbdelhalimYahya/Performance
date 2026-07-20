import { Injectable, Logger } from '@nestjs/common';
import { Readable, Transform, pipeline } from 'stream';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const pipelineAsync = promisify(pipeline);

/**
 * STREAM PROCESSING SERVICE
 *
 * Demonstrates three key stream patterns:
 * 1. Back-pressure: piping automatically buffers when downstream is slow
 * 2. Transform streams: process data chunk-by-chunk
 * 3. Pipeline: error propagation across stream chains
 *
 * Why piping handles back-pressure:
 * - pipe() calls resume/pause on the source based on writableNeedDrain
 * - When writable buffer is full, source is paused (stops reading)
 * - When writable drains, source is resumed
 * - Manual push loops ignore this and cause memory bloat
 *
 * pipeline() vs pipe():
 * - pipeline destroys ALL streams on error (pipe doesn't)
 * - pipeline handles async cleanup (pipe needs manual .close())
 * - pipeline converts callbacks to promises
 */
@Injectable()
export class StreamProcessingService {
  private readonly logger = new Logger(StreamProcessingService.name);

  /**
   * Stream-compress a file using pipe().
   * Handles back-pressure automatically: if gzip transform is slow,
   * the read stream pauses until gzip catches up.
   */
  async compressFile(inputPath: string, outputPath: string): Promise<{ inputSize: number; outputSize: number }> {
    const inputSize = fs.statSync(inputPath).size;

    await pipelineAsync(
      fs.createReadStream(inputPath),
      zlib.createGzip({ level: 6 }),
      fs.createWriteStream(outputPath),
    );

    const outputSize = fs.statSync(outputPath).size;
    this.logger.log(`Compressed: ${inputSize} → ${outputSize} bytes (${((outputSize / inputSize) * 100).toFixed(1)}%)`);

    return { inputSize, outputSize };
  }

  /**
   * CSV line-by-line processing.
   * Streams a large CSV, parses each line, transforms it, and writes output.
   * Never holds the full file in memory — critical for 1GB+ files.
   */
  async processCsv(inputPath: string, outputPath: string): Promise<{ linesProcessed: number }> {
    let linesProcessed = 0;

    const parseLine = new Transform({
      objectMode: true,
      transform(chunk: Buffer, encoding: string, callback) {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          const [id, name, price] = line.split(',');
          if (id && name && price) {
            this.push(JSON.stringify({ id: parseInt(id), name: name.trim(), price: parseFloat(price) }) + '\n');
          }
        }
        callback();
      },
    });

    const countLines = new Transform({
      objectMode: true,
      transform(chunk: Buffer, encoding: string, callback) {
        linesProcessed++;
        this.push(chunk);
        callback();
      },
    });

    await pipelineAsync(
      fs.createReadStream(inputPath),
      parseLine,
      countLines,
      fs.createWriteStream(outputPath),
    );

    this.logger.log(`CSV processed: ${linesProcessed} lines`);
    return { linesProcessed };
  }

  /**
   * Create a readable stream from a large array for demonstration.
   * Useful for testing stream processing without real files.
   */
  createReadStream(data: string[], highWaterMark = 1024): Readable {
    let index = 0;
    return new Readable({
      highWaterMark,
      read() {
        if (index >= data.length) {
          this.push(null); // Signal end of stream
          return;
        }
        this.push(data[index++] + '\n');
      },
    });
  }
}
