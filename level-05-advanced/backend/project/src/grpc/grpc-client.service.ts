import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc, Client } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';

/**
 * gRPC CLIENT SERVICE
 *
 * Typed client for calling the gRPC ProductService.
 * Measures RTT (round-trip time) for each call with nanosecond precision.
 *
 * Usage:
 *   const product = await this.grpcClient.getProduct({ id: 'prod-1' });
 *   const list = await this.grpcClient.listProducts({ page: 1, limit: 10 });
 */
@Injectable()
export class GrpcClientService implements OnModuleInit {
  private readonly logger = new Logger(GrpcClientService.name);
  private productService: any;

  constructor(@Inject('PRODUCT_SERVICE') private client: ClientGrpc) {}

  onModuleInit() {
    this.productService = this.client.getService<any>('ProductService');
    this.logger.log('gRPC client initialized');
  }

  /**
   * Get a single product by ID.
   * Measures RTT with nanosecond precision.
   */
  async getProduct(id: string): Promise<{ data: any; rttNs: number }> {
    const start = process.hrtime.bigint();
    const data = await this.productService.GetProduct({ id }).toPromise();
    const rttNs = Number(process.hrtime.bigint() - start);
    return { data, rttNs };
  }

  /**
   * List products with pagination.
   */
  async listProducts(page: number, limit: number, category?: string): Promise<{ data: any; rttNs: number }> {
    const start = process.hrtime.bigint();
    const data = await this.productService.ListProducts({ page, limit, category: category || '' }).toPromise();
    const rttNs = Number(process.hrtime.bigint() - start);
    return { data, rttNs };
  }

  /**
   * Create a new product.
   */
  async createProduct(input: {
    name: string; description: string; price: number;
    stock: number; category: string;
  }): Promise<{ data: any; rttNs: number }> {
    const start = process.hrtime.bigint();
    const data = await this.productService.CreateProduct(input).toPromise();
    const rttNs = Number(process.hrtime.bigint() - start);
    return { data, rttNs };
  }

  /**
   * Stream products from server.
   * Returns array of all streamed items with total duration.
   */
  async streamProducts(category: string, count: number): Promise<{ items: any[]; durationNs: number; itemCount: number }> {
    const start = process.hrtime.bigint();
    const items: any[] = [];

    return new Promise((resolve) => {
      const stream = this.productService.StreamProducts({ category, count });
      stream.subscribe({
        next: (item: any) => items.push(item),
        complete: () => {
          resolve({
            items,
            durationNs: Number(process.hrtime.bigint() - start),
            itemCount: items.length,
          });
        },
        error: (err: any) => {
          this.logger.error(`Stream error: ${err}`);
          resolve({ items, durationNs: Number(process.hrtime.bigint() - start), itemCount: items.length });
        },
      });
    });
  }
}
