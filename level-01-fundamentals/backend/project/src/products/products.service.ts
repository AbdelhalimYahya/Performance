import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateProductDto, ProductCategory } from './dto/create-product.dto';

// ============================================================================
// Types
// ============================================================================

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface FindAllOptions {
  page: number;
  limit: number;
  category?: string;
  sort?: 'price' | 'name' | 'date';
  order?: 'asc' | 'desc';
}

export interface ProductSummary {
  totalCount: number;
  categoryCounts: Record<string, number>;
  priceRange: { min: number; max: number; avg: number };
}

// ============================================================================
// Seed Data
// ============================================================================

const ADJECTIVES = [
  'Premium', 'Ultra', 'Pro', 'Essential', 'Advanced',
  'Compact', 'Deluxe', 'Limited', 'Classic', 'Modern',
];

const PRODUCT_NAMES: Record<string, string[]> = {
  Electronics: ['Wireless Headphones', 'Smart Watch', 'USB-C Hub', 'Webcam', 'Speaker'],
  Clothing: ['Running Shoes', 'Winter Jacket', 'Denim Jeans', 'Cotton T-Shirt', 'Wool Sweater'],
  Home: ['Coffee Maker', 'Air Purifier', 'Robot Vacuum', 'LED Lamp', 'Desk Organizer'],
  Sports: ['Yoga Mat', 'Resistance Bands', 'Jump Rope', 'Dumbbells', 'Water Bottle'],
  Books: ['JavaScript Guide', 'Design Patterns', 'Clean Code', 'The Pragmatic Programmer', 'Refactoring'],
  Toys: ['Building Blocks', 'Puzzle Set', 'RC Car', 'Board Game', 'Art Kit'],
  Food: ['Organic Coffee', 'Protein Bars', 'Olive Oil', 'Dark Chocolate', 'Green Tea'],
  Health: ['Vitamin D3', 'Probiotics', 'Fish Oil', 'Multivitamin', 'Melatonin'],
  Automotive: ['Car Charger', 'Dash Cam', 'Seat Cover', 'Floor Mats', 'Air Freshener'],
  Garden: ['Plant Pot', 'Garden Tools', 'Lawn Seed', 'Hose Reel', 'Solar Light'],
};

function generateProducts(count: number): Product[] {
  const categories = Object.keys(PRODUCT_NAMES) as ProductCategory[];
  return Array.from({ length: count }, (_, i) => {
    const category = categories[i % categories.length];
    const names = PRODUCT_NAMES[category];
    const adjective = ADJECTIVES[i % ADJECTIVES.length];
    const name = names[i % names.length];

    return {
      id: randomUUID(),
      name: `${adjective} ${name}`,
      category,
      price: Math.round((Math.random() * 500 + 9.99) * 100) / 100,
      description: `High-quality ${name.toLowerCase()} for everyday use. Built to last.`,
      imageUrl: `https://picsum.photos/seed/${i + 1}/400/300`,
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });
}

// ============================================================================
// In-Memory Store
// ============================================================================

class InMemoryProductStore {
  private products = new Map<string, Product>();

  constructor() {
    const seed = generateProducts(500);
    for (const p of seed) {
      this.products.set(p.id, p);
    }
  }

  get size(): number {
    return this.products.size;
  }

  getAll(): Product[] {
    return Array.from(this.products.values());
  }

  get(id: string): Product | undefined {
    return this.products.get(id);
  }

  set(product: Product): void {
    this.products.set(product.id, product);
  }

  delete(id: string): boolean {
    return this.products.delete(id);
  }
}

// ============================================================================
// Products Service
// ============================================================================

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private readonly store = new InMemoryProductStore();
  private slowMode = false;

  constructor() {
    this.logger.log(`Products store initialized with ${this.store.size} products`);
  }

  /**
   * Sets slow mode on or off. When enabled, adds artificial delay to
   * all queries to demonstrate profiling in action.
   */
  setSlowMode(enabled: boolean): void {
    this.slowMode = enabled;
    this.logger.log(`Slow mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Find all products with filtering, sorting, and pagination.
   * Logs query time for performance monitoring.
   */
  async findAll(options: FindAllOptions): Promise<{ data: Product[]; total: number; page: number; limit: number }> {
    const start = performance.now();

    if (this.slowMode) {
      await new Promise((r) => setTimeout(r, 50));
    }

    let products = this.store.getAll();

    // Filter by category
    if (options.category) {
      products = products.filter((p) => p.category === options.category);
    }

    // Sort
    const order = options.order ?? 'asc';
    if (options.sort === 'price') {
      products.sort((a, b) => order === 'asc' ? a.price - b.price : b.price - a.price);
    } else if (options.sort === 'name') {
      products.sort((a, b) => order === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
    } else {
      products.sort((a, b) => order === 'asc'
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    const total = products.length;
    const startIdx = (options.page - 1) * options.limit;
    const data = products.slice(startIdx, startIdx + options.limit);

    const duration = performance.now() - start;
    this.logger.debug(`findAll: ${duration.toFixed(2)}ms (${total} results, page ${options.page})`);

    return { data, total, page: options.page, limit: options.limit };
  }

  /**
   * Find a single product by ID. O(1) Map lookup.
   */
  findOne(id: string): Product {
    const product = this.store.get(id);
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  /**
   * Create a new product from a DTO.
   */
  create(dto: CreateProductDto): Product {
    const now = new Date().toISOString();
    const product: Product = {
      id: randomUUID(),
      name: dto.name,
      category: dto.category,
      price: dto.price,
      description: dto.description ?? '',
      imageUrl: dto.imageUrl ?? `https://picsum.photos/seed/${Date.now()}/400/300`,
      createdAt: now,
      updatedAt: now,
    };

    this.store.set(product);
    this.logger.log(`Created product: ${product.id} (${product.name})`);
    return product;
  }

  /**
   * Update an existing product with partial data.
   */
  update(id: string, dto: Partial<CreateProductDto>): Product {
    const existing = this.findOne(id);
    const updated: Product = {
      ...existing,
      ...dto,
      updatedAt: new Date().toISOString(),
    };

    this.store.set(updated);
    this.logger.log(`Updated product: ${id}`);
    return updated;
  }

  /**
   * Delete a product by ID.
   */
  delete(id: string): void {
    const deleted = this.store.delete(id);
    if (!deleted) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    this.logger.log(`Deleted product: ${id}`);
  }

  /**
   * Get aggregated product statistics.
   * This is intentionally slow (O(n) without caching) to demonstrate profiling.
   */
  async getSummary(): Promise<ProductSummary> {
    const start = performance.now();

    if (this.slowMode) {
      await new Promise((r) => setTimeout(r, 200));
    }

    const products = this.store.getAll();
    const categoryCounts: Record<string, number> = {};
    let totalPrice = 0;
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (const product of products) {
      categoryCounts[product.category] = (categoryCounts[product.category] ?? 0) + 1;
      totalPrice += product.price;
      minPrice = Math.min(minPrice, product.price);
      maxPrice = Math.max(maxPrice, product.price);
    }

    const duration = performance.now() - start;
    this.logger.warn(`getSummary: ${duration.toFixed(2)}ms (O(n) aggregation)`);

    return {
      totalCount: products.length,
      categoryCounts,
      priceRange: {
        min: minPrice === Infinity ? 0 : minPrice,
        max: maxPrice === -Infinity ? 0 : maxPrice,
        avg: products.length > 0 ? Math.round((totalPrice / products.length) * 100) / 100 : 0,
      },
    };
  }
}
