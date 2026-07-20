/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  THESE PATTERNS ENABLE TREE SHAKING                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Every example below is tree-shakeable. Bundle sizes are accurate.
 */

// ─── Example 1: Direct Sub-Module Import ───────────────────────
// GOOD: import directly from the specific file, not the barrel
//
// date-fns publishes individual files (format.js, addDays.js, etc.)
// Importing from "date-fns/format" gives webpack a direct path —
// it can see exactly which code is used and shake everything else.
//
// Cost: ~2KB (just the format function) vs ~80KB (full library)
import { format } from 'date-fns/format';

export function formatDateSafe(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

// ─── Example 2: Named ESM Import from Tree-Shakeable Package ──
// GOOD: lodash-es is published as ESM with no side effects
//
// lodash-es compiles each function to a separate ESM module.
// Webpack can statically resolve the import path and shake
// unused functions. lodash (CommonJS) cannot do this.
//
// Cost: ~2KB (just debounce) vs ~24KB (full lodash)
import { debounce } from 'lodash-es';

export const debouncedLog = debounce(console.log, 300);

// ─── Example 3: Inline Dynamic Import ──────────────────────────
// GOOD: dynamic import() is both code-split AND tree-shakeable
//
// webpack sees the import() as a split point AND can shake
// unused exports from the dynamically imported module.
// This gives you the best of both worlds.
//
// Cost: ~0KB in initial bundle (loaded on demand)
export async function loadHeavyProcessor() {
  const { processData } = await import('./utils/math');
  return processData;
}

// ─── Example 4: sideEffects: false in package.json ─────────────
// GOOD: declare your library as side-effect-free
//
// When your own library has "sideEffects": false in package.json,
// webpack can safely tree-shake unused exports even through
// barrel files. This is the correct pattern for your own code.
//
// Cost: depends on what you import — only used code is bundled.
// Without sideEffects: false, even named imports may be retained.
//
// package.json:
// {
//   "sideEffects": false
// }

// ─── Comparison Table ──────────────────────────────────────────
export const GOOD_PATTERNS = [
  {
    pattern: 'import { format } from "date-fns/format"',
    reason: 'Direct file path — webpack can statically resolve',
    cost: '~2KB',
    vs: '~80KB with namespace import',
  },
  {
    pattern: 'import { debounce } from "lodash-es"',
    reason: 'ESM package — each function is a separate module',
    cost: '~2KB',
    vs: '~72KB with require("lodash")',
  },
  {
    pattern: 'const { fn } = await import("./module")',
    reason: 'Dynamic import — code-split AND tree-shakeable',
    cost: '~0KB initial (lazy)',
    vs: '~15KB with barrel import',
  },
  {
    pattern: '"sideEffects": false in package.json',
    reason: 'Tells webpack your library has no side effects',
    cost: 'enables shaking of your own code',
    vs: 'keeps all exports as insurance',
  },
] as const;

// Re-export for the demo page
export { BAD_PATTERNS } from './bad-imports';
