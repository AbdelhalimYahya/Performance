/**
 * Replication controller — demonstrates read/write splitting endpoints.
 *
 * Endpoints:
 * - GET: reads from replica (fast, load-balanced)
 * - POST: writes to primary (consistent)
 * - POST /read-after-write: write then read from primary (consistency)
 */
import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ReplicationService } from './replication.service';

@Controller('api/replication')
export class ReplicationController {
  constructor(private readonly replicationService: ReplicationService) {}

  // GET /api/replication/read?category=electronics
  @Get('read')
  @HttpCode(HttpStatus.OK)
  async read(@Query('category') category: string) {
    return this.replicationService.readFromReplica(category || 'electronics');
  }

  // POST /api/replication/write
  @Post('write')
  @HttpCode(HttpStatus.CREATED)
  async write(
    @Body() body: { name: string; price: number; category: string },
  ) {
    return this.replicationService.writeToPrimary(body);
  }

  // POST /api/replication/read-after-write
  @Post('read-after-write')
  @HttpCode(HttpStatus.OK)
  async readAfterWrite(
    @Body() body: { name: string; price: number; category: string },
  ) {
    return this.replicationService.writeThenRead(body);
  }
}
