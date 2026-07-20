import { Controller, Post, Get, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StreamProcessingService } from './stream-processing.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('stream')
export class StreamController {
  constructor(private readonly streamService: StreamProcessingService) {}

  @Post('compress')
  async compress(@Body() body: { inputPath: string; outputPath: string }) {
    const output = body.outputPath || body.inputPath + '.gz';
    return this.streamService.compressFile(body.inputPath, output);
  }

  @Post('process-csv')
  async processCsv(@Body() body: { inputPath: string }) {
    const outputPath = body.inputPath + '.processed.json';
    return this.streamService.processCsv(body.inputPath, outputPath);
  }

  @Get('demo-data')
  async generateDemoData() {
    const demoPath = path.join(process.cwd(), 'demo-data.csv');
    const lines = Array.from({ length: 10000 }, (_, i) =>
      `${i + 1},Product ${i + 1},${(Math.random() * 100).toFixed(2)}`
    );
    fs.writeFileSync(demoPath, lines.join('\n'));
    return { path: demoPath, lines: lines.length };
  }
}
