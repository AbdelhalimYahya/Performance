import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import {
  serializeProduct,
  serializeProductList,
  serializeProductSummary,
} from './schemas/product.schema';

// ============================================================================
// Types
// ============================================================================

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  isActive: boolean;
  tags: string[];
  variants: { size: string; color: string; sku: string }[];
  createdAt: string;
}

interface BenchmarkResult {
  method: string;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p99Ms: number;
  throughputOpsPerSec: number;
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORIES = ['electronics', 'clothing', 'home', 'sports', 'books', 'toys'];
const COLORS = ['red', 'blue', 'green', 'black', 'white', 'gray'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function generateProducts(count: number): Product[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `prod_${i + 1}`,
    name: `Product ${i + 1}`,
    category: CATEGORIES[i % CATEGORIES.length],
    price: parseFloat((Math.random() * 500 + 9.99).toFixed(2)),
    stock: (i % 100) + 1,
    isActive: i % 3 !== 0,
    tags: [`tag-${i % 10}`, `tag-${(i + 5) % 10}`],
    variants: [
      { size: SIZES[i % SIZES.length], color: COLORS[i % COLORS.length], sku: `SKU-${i}-A` },
      { size: SIZES[(i + 1) % SIZES.length], color: COLORS[(i + 1) % COLORS.length], sku: `SKU-${i}-B` },
    ],
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
  }));
}

// ============================================================================
// Controller
// ============================================================================

@Controller('serialization')
export class SerializationController {
  // ---------------------------------------------------------------------------
  // GET /serialization/native — JSON.stringify baseline
  // ---------------------------------------------------------------------------
  @Get('native')
  native(@Res() res: Response) {
    const products = generateProducts(1000);
    const start = performance.now();
    const serialized = JSON.stringify(products);
    const duration = performance.now() - start;

    res.setHeader('X-Serialization-Method', 'JSON.stringify');
    res.setHeader('X-Serialization-Time', `${duration.toFixed(4)}ms`);
    res.setHeader('Content-Type', 'application/json');
    res.send(serialized);
  }

  // ---------------------------------------------------------------------------
  // GET /serialization/fast — fast-json-stringify
  // ---------------------------------------------------------------------------
  @Get('fast')
  fast(@Res() res: Response) {
    const products = generateProducts(1000);
    const start = performance.now();
    const serialized = serializeProductList({
      items: products,
      total: products.length,
      page: 1,
    });
    const duration = performance.now() - start;

    res.setHeader('X-Serialization-Method', 'fast-json-stringify');
    res.setHeader('X-Serialization-Time', `${duration.toFixed(4)}ms`);
    res.setHeader('Content-Type', 'application/json');
    res.send(serialized);
  }

  // ---------------------------------------------------------------------------
  // GET /serialization/manual — manual string concatenation
  // ---------------------------------------------------------------------------
  @Get('manual')
  manual(@Res() res: Response) {
    const products = generateProducts(1000);
    const start = performance.now();

    let output = '{"items":[';
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (i > 0) output += ',';
      output += `{${JSON.stringify('id')}:${JSON.stringify(p.id)},${JSON.stringify('name')}:${JSON.stringify(p.name)},${JSON.stringify('category')}:${JSON.stringify(p.category)},${JSON.stringify('price')}:${p.price},${JSON.stringify('stock')}:${p.stock},${JSON.stringify('isActive')}:${p.isActive},${JSON.stringify('tags')}:${JSON.stringify(p.tags)},${JSON.stringify('variants')}:${JSON.stringify(p.variants)},${JSON.stringify('createdAt')}:${JSON.stringify(p.createdAt)}}`;
    }
    output += `],"total":${products.length},"page":1}`;

    const duration = performance.now() - start;

    res.setHeader('X-Serialization-Method', 'manual-concatenation');
    res.setHeader('X-Serialization-Time', `${duration.toFixed(4)}ms`);
    res.setHeader('Content-Type', 'application/json');
    res.send(output);
  }

  // ---------------------------------------------------------------------------
  // GET /serialization/benchmark — runs each method 100 times with stats
  // ---------------------------------------------------------------------------
  @Get('benchmark')
  benchmark(@Res() res: Response) {
    const products = generateProducts(1000);
    const iterations = 100;

    const methods: { name: string; fn: () => string }[] = [
      {
        name: 'JSON.stringify',
        fn: () => JSON.stringify(products),
      },
      {
        name: 'fast-json-stringify',
        fn: () =>
          serializeProductList({
            items: products,
            total: products.length,
            page: 1,
          }),
      },
      {
        name: 'manual-concatenation',
        fn: () => {
          let out = '{"items":[';
          for (let i = 0; i < products.length; i++) {
            const p = products[i];
            if (i > 0) out += ',';
            out += `{${JSON.stringify('id')}:${JSON.stringify(p.id)},${JSON.stringify('name')}:${JSON.stringify(p.name)},${JSON.stringify('category')}:${JSON.stringify(p.category)},${JSON.stringify('price')}:${p.price},${JSON.stringify('stock')}:${p.stock},${JSON.stringify('isActive')}:${p.isActive},${JSON.stringify('tags')}:${JSON.stringify(p.tags)},${JSON.stringify('variants')}:${JSON.stringify(p.variants)},${JSON.stringify('createdAt')}:${JSON.stringify(p.createdAt)}}`;
          }
          out += `],"total":${products.length},"page":1}`;
          return out;
        },
      },
    ];

    const results: BenchmarkResult[] = methods.map(({ name, fn }) => {
      const times: number[] = [];

      // Warmup
      for (let i = 0; i < 10; i++) fn();

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        times.push(performance.now() - start);
      }

      times.sort((a, b) => a - b);
      const avg = times.reduce((s, t) => s + t, 0) / iterations;
      const min = times[0];
      const max = times[iterations - 1];
      const p99 = times[Math.floor(iterations * 0.99)];
      const throughput = Math.round(1000 / avg);

      return {
        method: name,
        avgMs: parseFloat(avg.toFixed(4)),
        minMs: parseFloat(min.toFixed(4)),
        maxMs: parseFloat(max.toFixed(4)),
        p99Ms: parseFloat(p99.toFixed(4)),
        throughputOpsPerSec: throughput,
      };
    });

    res.setHeader('Content-Type', 'application/json');
    res.json({ iterations, recordCount: 1000, results });
  }

  // ---------------------------------------------------------------------------
  // GET /serialization/field-projection?fields=id,name,price
  // Demonstrates sparse fieldsets — only return requested fields
  // ---------------------------------------------------------------------------
  @Get('field-projection')
  fieldProjection(@Query('fields') fieldsQuery: string, @Res() res: Response) {
    const products = generateProducts(1000);
    const requestedFields = fieldsQuery ? fieldsQuery.split(',') : null;

    if (!requestedFields) {
      res.setHeader('Content-Type', 'application/json');
      return res.json({
        message: 'Provide ?fields=id,name,price to see field projection',
        availableFields: ['id', 'name', 'category', 'price', 'stock', 'isActive', 'tags', 'variants', 'createdAt'],
      });
    }

    const start = performance.now();
    const projected = products.map((product) => {
      const result: Record<string, unknown> = {};
      for (const field of requestedFields) {
        if (field in product) {
          result[field] = (product as Record<string, unknown>)[field];
        }
      }
      return result;
    });
    const duration = performance.now() - start;

    const projectedSize = Buffer.byteLength(JSON.stringify(projected));
    const fullSize = Buffer.byteLength(JSON.stringify(products));
    const reduction = ((1 - projectedSize / fullSize) * 100).toFixed(1);

    res.setHeader('X-Projection-Fields', requestedFields.join(','));
    res.setHeader('X-Projection-Reduction', `${reduction}%`);
    res.setHeader('X-Serialization-Time', `${duration.toFixed(4)}ms`);
    res.setHeader('Content-Type', 'application/json');
    res.json({
      fields: requestedFields,
      count: projected.length,
      payloadReduction: `${reduction}%`,
      fullSizeBytes: fullSize,
      projectedSizeBytes: projectedSize,
      durationMs: parseFloat(duration.toFixed(4)),
      data: projected,
    });
  }
}
