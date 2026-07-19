/**
 * cache-stats.js — Quick Redis cache statistics
 * Run: npm run cache:stats
 */

const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
});

async function main() {
  try {
    const info = await redis.info('stats');
    const memory = await redis.info('memory');
    const keyspace = await redis.info('keyspace');

    const hits = parseInt(info.match(/keyspace_hits:(\d+)/)?.[1] ?? '0', 10);
    const misses = parseInt(info.match(/keyspace_misses:(\d+)/)?.[1] ?? '0', 10);
    const hitRate = hits + misses > 0 ? ((hits / (hits + misses)) * 100).toFixed(1) : 'N/A';

    const usedMemory = memory.match(/used_memory_human:([\d.]+\w+)/)?.[1] ?? 'N/A';
    const peakMemory = memory.match(/used_memory_peak_human:([\d.]+\w+)/)?.[1] ?? 'N/A';

    const totalKeys = keyspace.match(/keys=(\d+)/)?.[1] ?? '0';

    console.log('=== Redis Cache Stats ===');
    console.log(`  Hits:          ${hits.toLocaleString()}`);
    console.log(`  Misses:        ${misses.toLocaleString()}`);
    console.log(`  Hit Rate:      ${hitRate}%`);
    console.log(`  Used Memory:   ${usedMemory}`);
    console.log(`  Peak Memory:   ${peakMemory}`);
    console.log(`  Total Keys:    ${totalKeys}`);
    console.log('========================');
  } catch (err) {
    console.error('Failed to connect to Redis:', err.message);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

main();
