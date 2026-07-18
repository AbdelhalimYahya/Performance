import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProfilingInterceptor } from '../interceptors/profiling.interceptor';

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly profilingInterceptor: ProfilingInterceptor) {}

  /**
   * Returns server profiling statistics including request counts,
   * average duration, and percentile latencies (p95, p99).
   */
  @Get()
  @ApiOperation({ summary: 'Get server profiling statistics' })
  @ApiResponse({ status: 200, description: 'Profiling stats returned successfully' })
  getStats() {
    return this.profilingInterceptor.getStats();
  }
}
