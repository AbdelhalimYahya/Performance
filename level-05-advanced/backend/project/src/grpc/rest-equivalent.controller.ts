import { Controller, Get, Post, Param, Query, Body, Res, Req } from '@nestjs/common';
import { Request, Response } from 'express';
import { products } from './product.grpc.controller';

/**
 * REST EQUIVALENT CONTROLLER
 *
 * Same business logic as gRPC controller but over HTTP/JSON.
 * Used for benchmarking comparison: gRPC vs REST.
 *
 * Each endpoint adds timing and payload size headers:
 * - X-Response-Time: processing duration in ms
 * - X-Payload-Size: approximate response body size in bytes
 *
 * Why REST is slower than gRPC:
 * - JSON serialization: ~3-5x larger than protobuf
 * - HTTP/1.1: no multiplexing, head-of-line blocking
 * - Text encoding: every field has key name repeated
 * - JSON.parse/JSON.stringify: CPU overhead on both sides
 */
@Controller('grpc-compare')
export class RestEquivalentController {
  @Get('product/:id')
  getProduct(@Param('id') id: string, @Res() res: Response) {
    const start = performance.now();
    const product = products.find((p) => p.id === id);

    if (!product) {
      res.status(404).json({ error: `Product ${id} not found` });
      return;
    }

    const body = JSON.stringify(product);
    res.set('X-Response-Time', `${(performance.now() - start).toFixed(2)}ms`);
    res.set('X-Payload-Size', `${Buffer.byteLength(body)}bytes`);
    res.set('Content-Type', 'application/json');
    res.send(body);
  }

  @Get('products')
  listProducts(
    @Query('page') pageStr: string,
    @Query('limit') limitStr: string,
    @Query('category') category: string,
    @Res() res: Response,
  ) {
    const start = performance.now();
    const page = parseInt(pageStr || '1', 10);
    const limit = parseInt(limitStr || '20', 10);

    let filtered = products;
    if (category) {
      filtered = products.filter((p) => p.category === category);
    }

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const paged = filtered.slice(offset, offset + limit);

    const response = { products: paged, total, page, limit };
    const body = JSON.stringify(response);

    res.set('X-Response-Time', `${(performance.now() - start).toFixed(2)}ms`);
    res.set('X-Payload-Size', `${Buffer.byteLength(body)}bytes`);
    res.set('Content-Type', 'application/json');
    res.send(body);
  }

  @Post('products')
  createProduct(@Body() body: any, @Res() res: Response) {
    const start = performance.now();

    if (!body.name || body.price <= 0) {
      res.status(400).json({ error: 'Invalid product data' });
      return;
    }

    const product = {
      id: `prod-${Date.now()}`,
      name: body.name,
      description: body.description || '',
      price: body.price,
      stock: body.stock || 0,
      category: body.category || 'general',
      available: true,
      created_at: Date.now(),
    };

    products.push(product);

    const responseBody = JSON.stringify(product);
    res.set('X-Response-Time', `${(performance.now() - start).toFixed(2)}ms`);
    res.set('X-Payload-Size', `${Buffer.byteLength(responseBody)}bytes`);
    res.set('Content-Type', 'application/json');
    res.status(201).send(responseBody);
  }

  /**
   * SSE stream — server-sent events for product streaming.
   * Equivalent to gRPC StreamProducts but over HTTP/1.1.
   *
   * Why slower than gRPC streaming:
   * - HTTP/1.1: no multiplexing, each event is a text chunk
   * - JSON encoding: each product serialized as JSON text
   * - Base64 overhead: SSE adds framing overhead
   * - No binary: SSE is text-only, protobuf is binary
   */
  @Get('products/stream')
  streamProducts(
    @Query('category') category: string,
    @Query('count') countStr: string,
    @Res() res: Response,
  ) {
    const count = parseInt(countStr || '1000', 10);
    let filtered = products;
    if (category) {
      filtered = products.filter((p) => p.category === category);
    }
    const toStream = filtered.slice(0, count);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let index = 0;
    const interval = setInterval(() => {
      if (index >= toStream.length) {
        res.write('data: [DONE]\n\n');
        clearInterval(interval);
        res.end();
        return;
      }

      const product = toStream[index];
      res.write(`data: ${JSON.stringify(product)}\n\n`);
      index++;
    }, 10);

    res.on('close', () => clearInterval(interval));
  }
}
