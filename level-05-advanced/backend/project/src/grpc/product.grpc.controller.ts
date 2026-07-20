import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod, GrpcStreamMethod } from '@nestjs/microservices';
import { Observable, Subject, interval, take } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * PRODUCT gRPC CONTROLLER
 *
 * Implements all 4 RPCs from product.proto.
 * Each method logs execution time and approximate payload size.
 *
 * Server streaming (StreamProducts):
 * - Uses RxJS Observable to emit products over time
 * - 10ms delay between items simulates a live feed
 * - Client receives products as they're produced (no buffering entire response)
 *
 * Why this is faster than REST:
 * - Binary protobuf encoding: ~3-5x smaller payloads
 * - HTTP/2 multiplexing: no head-of-line blocking
 * - Header compression: HPACK eliminates repeated headers
 * - No JSON.parse/JSON.stringify overhead
 */

interface ProductRequest { id: string; }
interface ProductResponse {
  id: string; name: string; description: string;
  price: number; stock: number; category: string;
  available: boolean; created_at: number;
}
interface ListProductsRequest { page: number; limit: number; category: string; }
interface ListProductsResponse {
  products: ProductResponse[]; total: number; page: number; limit: number;
}
interface CreateProductRequest {
  name: string; description: string; price: number;
  stock: number; category: string;
}
interface StreamProductsRequest { category: string; count: number; }

// In-memory product store (shared with REST controller)
const products: ProductResponse[] = Array.from({ length: 1000 }, (_, i) => ({
  id: `prod-${i + 1}`,
  name: `Product ${i + 1}`,
  description: `Description for product ${i + 1}`,
  price: Math.round(Math.random() * 10000) / 100,
  stock: Math.floor(Math.random() * 500),
  category: ['electronics', 'clothing', 'food', 'books'][i % 4],
  available: Math.random() > 0.2,
  created_at: Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000),
}));

@Controller()
export class ProductGrpcController {
  private readonly logger = new Logger(ProductGrpcController.name);

  /**
   * GetProduct — unary RPC
   * Finds product by ID, returns single response.
   */
  @GrpcMethod('ProductService', 'GetProduct')
  async getProduct(data: ProductRequest): Promise<ProductResponse> {
    const start = performance.now();
    const product = products.find((p) => p.id === data.id);

    if (!product) {
      throw new Error(`Product ${data.id} not found`);
    }

    const durationMs = performance.now() - start;
    this.logger.log(`GetProduct ${data.id}: ${durationMs.toFixed(2)}ms`);
    return product;
  }

  /**
   * ListProducts — unary RPC with pagination
   * Returns paginated list with optional category filter.
   */
  @GrpcMethod('ProductService', 'ListProducts')
  async listProducts(data: ListProductsRequest): Promise<ListProductsResponse> {
    const start = performance.now();

    let filtered = products;
    if (data.category) {
      filtered = products.filter((p) => p.category === data.category);
    }

    const total = filtered.length;
    const page = data.page || 1;
    const limit = data.limit || 20;
    const offset = (page - 1) * limit;
    const paged = filtered.slice(offset, offset + limit);

    const durationMs = performance.now() - start;
    this.logger.log(`ListProducts page=${page}: ${durationMs.toFixed(2)}ms (${paged.length} items)`);

    return { products: paged, total, page, limit };
  }

  /**
   * CreateProduct — unary RPC
   * Validates input and creates product.
   */
  @GrpcMethod('ProductService', 'CreateProduct')
  async createProduct(data: CreateProductRequest): Promise<ProductResponse> {
    const start = performance.now();

    if (!data.name || data.price <= 0) {
      throw new Error('Invalid product data: name required, price must be positive');
    }

    const product: ProductResponse = {
      id: `prod-${Date.now()}`,
      name: data.name,
      description: data.description || '',
      price: data.price,
      stock: data.stock || 0,
      category: data.category || 'general',
      available: true,
      created_at: Date.now(),
    };

    products.push(product);

    const durationMs = performance.now() - start;
    this.logger.log(`CreateProduct ${product.id}: ${durationMs.toFixed(2)}ms`);
    return product;
  }

  /**
   * StreamProducts — server-side streaming RPC
   * Streams products one by one using RxJS Observable.
   * 10ms delay between items simulates a live data feed.
   *
   * Client receives products as they're produced.
   * Unlike REST (must buffer entire response), gRPC streams
   * each product immediately over HTTP/2.
   */
  @GrpcStreamMethod('ProductService', 'StreamProducts')
  streamProducts(data: StreamProductsRequest): Observable<ProductResponse> {
    const start = performance.now();
    const count = data.count || 1000;

    let filtered = products;
    if (data.category) {
      filtered = products.filter((p) => p.category === data.category);
    }

    const toStream = filtered.slice(0, count);

    this.logger.log(`StreamProducts: streaming ${toStream.length} items`);

    // Emit products with 10ms delay between each
    return interval(10).pipe(
      take(toStream.length),
      map((i) => {
        if (i === toStream.length - 1) {
          const durationMs = performance.now() - start;
          this.logger.log(`StreamProducts complete: ${durationMs.toFixed(2)}ms`);
        }
        return toStream[i];
      }),
    );
  }
}

export { products };
