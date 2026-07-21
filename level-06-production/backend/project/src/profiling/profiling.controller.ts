/**
 * PROFILING CONTROLLER — Admin-Protected Profiling Endpoints
 *
 * All endpoints require an X-Admin-Key header matching the
 * PROFILING_ADMIN_KEY environment variable. Profiling must be
 * protected — it exposes internal process state.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { CpuProfilerService } from './cpu-profiler.service';

// ─── Request Types ───────────────────────────────────────────────────────

interface StartProfileBody {
  durationMs: number;
  label: string;
}

interface AutoProfileBody {
  intervalMs: number;
  durationMs: number;
}

// ─── Controller ──────────────────────────────────────────────────────────

@Controller('profiling')
export class ProfilingController {
  constructor(private readonly profiler: CpuProfilerService) {}

  // ─── POST /profiling/start ─────────────────────────────────────────

  @Post('start')
  async startProfile(
    @Body() body: StartProfileBody,
    @Headers('x-admin-key') adminKey: string
  ) {
    this.validateAdminKey(adminKey);

    if (!body.durationMs || body.durationMs < 100 || body.durationMs > 60000) {
      throw new BadRequestException('durationMs must be between 100 and 60000');
    }

    if (!body.label || body.label.length > 50) {
      throw new BadRequestException('label is required and must be under 50 chars');
    }

    const filePath = await this.profiler.startProfiling(body.durationMs, body.label);

    return {
      status: 'completed',
      filePath,
      durationMs: body.durationMs,
      label: body.label,
    };
  }

  // ─── GET /profiling/status ─────────────────────────────────────────

  @Get('status')
  getStatus(@Headers('x-admin-key') adminKey: string) {
    this.validateAdminKey(adminKey);
    return this.profiler.getStatus();
  }

  // ─── GET /profiling/summary ────────────────────────────────────────

  @Get('summary')
  getSummary(@Headers('x-admin-key') adminKey: string) {
    this.validateAdminKey(adminKey);

    const summary = this.profiler.getLastProfileSummary();
    if (!summary) {
      return { status: 'no-profile', message: 'No profile available yet' };
    }

    return { status: 'ok', ...summary };
  }

  // ─── POST /profiling/auto ──────────────────────────────────────────

  @Post('auto')
  enableAutoProfile(
    @Body() body: AutoProfileBody,
    @Headers('x-admin-key') adminKey: string
  ) {
    this.validateAdminKey(adminKey);

    if (!body.intervalMs || body.intervalMs < 30000) {
      throw new BadRequestException('intervalMs must be at least 30000 (30s)');
    }

    if (!body.durationMs || body.durationMs < 100 || body.durationMs > 10000) {
      throw new BadRequestException('durationMs must be between 100 and 10000');
    }

    this.profiler.scheduleAutoProfile(body.intervalMs, body.durationMs);

    return {
      status: 'auto-profiling enabled',
      intervalMs: body.intervalMs,
      durationMs: body.durationMs,
    };
  }

  // ─── Auth Check ────────────────────────────────────────────────────

  private validateAdminKey(providedKey: string) {
    const expectedKey = process.env.PROFILING_ADMIN_KEY;
    if (!expectedKey) {
      throw new UnauthorizedException('Profiling is not configured (PROFILING_ADMIN_KEY missing)');
    }
    if (providedKey !== expectedKey) {
      throw new UnauthorizedException('Invalid admin key');
    }
  }
}
