import { Controller, Post, Body, Get } from '@nestjs/common';
import { WorkerPoolService } from './worker-pool.service';

@Controller('worker-pool')
export class WorkerPoolController {
  constructor(private readonly pool: WorkerPoolService) {}

  @Post('hash')
  async hash(@Body() body: { iterations: number; input: string }) {
    return this.pool.run('hashCompute', body);
  }

  @Post('aggregate')
  async aggregate(@Body() body: { values: number[] }) {
    return this.pool.run('aggregateData', body);
  }

  @Get('stats')
  stats() {
    return this.pool.getStats();
  }
}
