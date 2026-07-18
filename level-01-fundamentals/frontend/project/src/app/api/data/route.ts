import { NextResponse } from 'next/server';

// ============================================================================
// Types
// ============================================================================

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  imageUrl: string;
  description: string;
  createdAt: string;
}

interface CacheEntry {
  data: Product[];
  timestamp: number;
}

// ============================================================================
// Mock Data Generation
// ============================================================================

const CATEGORIES = [
  'Electronics', 'Clothing', 'Home & Kitchen', 'Sports', 'Books',
  'Toys', 'Food & Beverage', 'Health', 'Automotive', 'Garden',
];

const PRODUCT_NAMES = [
  'Wireless Headphones', 'Ergonomic Chair', 'Smart Watch', 'USB-C Hub',
  'Mechanical Keyboard', 'LED Desk Lamp', 'Standing Desk', 'Monitor Stand',
  'Noise Cancelling Earbuds', 'Laptop Sleeve', 'Webcam HD', 'Portable Charger',
  'Bluetooth Speaker', 'Fitness Tracker', 'Smart Plug', 'Air Purifier',
  'Coffee Maker', 'Instant Pot', 'Robot Vacuum', 'Air Fryer',
];

const ADJECTIVES = [
  'Premium', 'Ultra', 'Pro', 'Essential', 'Advanced',
  'Compact', 'Deluxe', 'Limited', 'Classic', 'Modern',
];

function generateProducts(count: number): Product[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `${ADJECTIVES[i % ADJECTIVES.length]} ${PRODUCT_NAMES[i % PRODUCT_NAMES.length]}`,
    category: CATEGORIES[i % CATEGORIES.length],
    price: Math.round((Math.random() * 500 + 9.99) * 100) / 100,
    imageUrl: `https://picsum.photos/seed/${i + 1}/400/300`,
    description: `High-quality ${PRODUCT_NAMES[i % PRODUCT_NAMES.length].toLowerCase()} designed for everyday use. Built to last with premium materials.`,
    createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

// ============================================================================
// Simple In-Memory Cache
// ============================================================================

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

function getCacheKey(url: string): string {
  return url;
}

function getCachedData(key: string): Product[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCacheData(key: string, data: Product[]): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// ============================================================================
// Request Logging
// ============================================================================

function logRequest(path: string, delay: number, cacheStatus: string): void {
  const timestamp = new Date().toISOString();
  console.log(
    JSON.stringify({
      timestamp,
      path,
      delay,
      cacheStatus,
      message: `[API] ${cacheStatus} ${path} (delay: ${delay}ms)`,
    })
  );
}

// ============================================================================
// GET Handler
// ============================================================================

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const delay = Math.min(Math.max(parseInt(searchParams.get('delay') ?? '0', 10) || 0, 0), 10_000);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 200);
  const cacheKey = getCacheKey(request.url);

  // Check cache first
  const cacheStart = performance.now();
  const cached = getCachedData(cacheKey);
  const isCacheHit = cached !== null;
  const cacheDuration = performance.now() - cacheStart;

  logRequest(new URL(request.url).pathname, delay, isCacheHit ? 'HIT' : 'MISS');

  // Simulate database query time
  const dbStart = performance.now();
  let data: Product[];

  if (isCacheHit) {
    data = cached!;
  } else {
    // Simulate slow DB query on cache miss
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    data = generateProducts(limit);
    setCacheData(cacheKey, data);
  }

  const dbDuration = performance.now() - dbStart;

  // Serialize response
  const serializeStart = performance.now();
  const serialized = JSON.stringify(data);
  const serializeDuration = performance.now() - serializeStart;

  const totalDuration = dbDuration + serializeDuration + cacheDuration;

  // Build response with timing headers
  const response = new NextResponse(serialized, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      'X-Response-Time': `${totalDuration.toFixed(2)}ms`,
      'X-Cache': isCacheHit ? 'HIT' : 'MISS',
      'X-DB-Query-Time': `${dbDuration.toFixed(2)}ms`,
      'X-Cache-Duration': `${cacheDuration.toFixed(2)}ms`,
      'Server-Timing': [
        `cache;dur=${cacheDuration.toFixed(2)}`,
        `db;dur=${dbDuration.toFixed(2)}`,
        `serialize;dur=${serializeDuration.toFixed(2)}`,
        `total;dur=${totalDuration.toFixed(2)}`,
      ].join(', '),
    },
  });

  return response;
}
