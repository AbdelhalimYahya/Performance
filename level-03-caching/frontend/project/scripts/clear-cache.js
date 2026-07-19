/**
 * clear-cache.js
 * Clears the Next.js build cache and any service worker caches.
 * Run: npm run cache:clear
 */

const fs = require('fs');
const path = require('path');

const TARGETS = [
  { name: '.next/cache', type: 'dir' },
  { name: '.next', type: 'dir' },
  { name: 'node_modules/.cache', type: 'dir' },
  { name: 'out', type: 'dir' },
];

let cleared = 0;

for (const target of TARGETS) {
  const fullPath = path.join(process.cwd(), target.name);
  if (fs.existsSync(fullPath)) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`  Cleared: ${target.name}`);
      cleared++;
    } catch (err) {
      console.error(`  Failed to clear ${target.name}:`, err.message);
    }
  }
}

if (cleared === 0) {
  console.log('  No caches found to clear.');
} else {
  console.log(`\n  Done — cleared ${cleared} cache(s).`);
}
