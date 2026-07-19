/**
 * Bulk controller — endpoints for bulk database operations.
 *
 * Demonstrates performance difference between individual and batch operations.
 * Use autocannon to benchmark each endpoint.
 */
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { BulkService } from './bulk.service';

@Controller('api/bulk')
export class BulkController {
  constructor(private readonly bulkService: BulkService) {}

  // POST /api/bulk/insert
  @Post('insert')
  @HttpCode(HttpStatus.CREATED)
  async bulkInsert(
    @Body()
    body: {
      products: Array<{
        name: string;
        price: number;
        category: string;
        sellerId: string;
      }>;
    },
  ) {
    return this.bulkService.bulkInsert(body.products);
  }

  // POST /api/bulk/update
  @Post('update')
  @HttpCode(HttpStatus.OK)
  async bulkUpdate(
    @Body()
    body: {
      updates: Array<{ id: string; price: number }>;
    },
  ) {
    return this.bulkService.bulkUpdate(body.updates);
  }

  // POST /api/bulk/delete
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  async bulkDelete(@Body() body: { ids: string[] }) {
    return this.bulkService.bulkDelete(body.ids);
  }

  // POST /api/bulk/generate
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generateTestData(
    @Body() body: { count: number; category: string },
  ) {
    return this.bulkService.generateTestData(
      body.count || 1000,
      body.category || 'test-data',
    );
  }
}
