/**
 * Seed script — generates realistic test data for database performance benchmarks.
 *
 * Creates:
 * - 200 users (10 sellers, 190 buyers)
 * - 10,000 products across 20 categories
 * - 50,000 reviews
 *
 * Uses batch inserts for speed. Running: npx prisma db seed
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES = [
  'electronics', 'clothing', 'home', 'books', 'sports',
  'toys', 'automotive', 'garden', 'health', 'food',
  'music', 'movies', 'software', 'jewelry', 'tools',
  'pet-supplies', 'baby', 'office', 'outdoor', 'art',
];

const FIRST_NAMES = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'William'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPrice(): number {
  return Math.round((Math.random() * 500 + 5) * 100) / 100;
}

function randomRating(): number {
  return Math.floor(Math.random() * 5) + 1;
}

async function seedUsers(): Promise<string[]> {
  console.log('Seeding users...');
  const sellerIds: string[] = [];

  // Create sellers (the only ones with products)
  for (let i = 0; i < 10; i++) {
    const user = await prisma.user.create({
      data: {
        name: `Seller ${i + 1}`,
        email: `seller${i + 1}@example.com`,
        role: 'seller',
        rating: Math.round((Math.random() * 2 + 3) * 100) / 100,
      },
    });
    sellerIds.push(user.id);
  }

  // Create bulk buyers (500 at a time)
  const buyerBatchSize = 500;
  const totalBuyers = 190;
  for (let i = 0; i < totalBuyers; i += buyerBatchSize) {
    const batch = [];
    for (let j = 0; j < Math.min(buyerBatchSize, totalBuyers - i); j++) {
      const firstName = randomItem(FIRST_NAMES);
      const lastName = randomItem(LAST_NAMES);
      batch.push({
        name: `${firstName} ${lastName}`,
        email: `user${i + j}@example.com`,
        role: 'user',
        rating: Math.round((Math.random() * 5) * 100) / 100,
      });
    }
    await prisma.user.createMany({ data: batch });
  }

  console.log(`Created ${sellerIds.length} sellers + ${totalBuyers} buyers`);
  return sellerIds;
}

async function seedProducts(sellerIds: string[]): Promise<string[]> {
  console.log('Seeding products...');
  const productIds: string[] = [];
  const batchSize = 500;
  const totalProducts = 10000;

  for (let i = 0; i < totalProducts; i += batchSize) {
    const batch = [];
    for (let j = 0; j < Math.min(batchSize, totalProducts - i); j++) {
      const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
      batch.push({
        name: `Product ${i + j} — ${category}`,
        description: `High-quality ${category} product for testing database performance.`,
        price: randomPrice(),
        stock: Math.floor(Math.random() * 1000),
        category,
        sellerId: randomItem(sellerIds),
        isActive: Math.random() > 0.1, // 90% active
      });
    }
    const result = await prisma.product.createMany({ data: batch });
    // Track created IDs for review seeding
    const products = await prisma.product.findMany({
      select: { id: true },
      skip: i,
      take: batchSize,
    });
    productIds.push(...products.map((p) => p.id));
  }

  console.log(`Created ${productIds.length} products`);
  return productIds;
}

async function seedReviews(productIds: string[]): Promise<void> {
  console.log('Seeding reviews...');
  const batchSize = 500;
  const totalReviews = 50000;
  const allUserIds = await prisma.user.findMany({ select: { id: true } });
  const userIds = allUserIds.map((u) => u.id);

  for (let i = 0; i < totalReviews; i += batchSize) {
    const batch = [];
    for (let j = 0; j < Math.min(batchSize, totalReviews - i); j++) {
      batch.push({
        content: `Review ${i + j}: Great product! Would recommend to others.`,
        rating: randomRating(),
        productId: randomItem(productIds),
        userId: randomItem(userIds),
      });
    }
    await prisma.review.createMany({ data: batch });
  }

  console.log(`Created ${totalReviews} reviews`);
}

async function main() {
  console.time('Total seed time');

  // Clean existing data
  await prisma.review.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  const sellerIds = await seedUsers();
  const productIds = await seedProducts(sellerIds);
  await seedReviews(productIds);

  console.timeEnd('Total seed time');
  console.log('Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
