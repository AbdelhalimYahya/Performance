/**
 * Barrel file — re-exports everything from individual modules.
 *
 * IMPORTANT: Barrel files in YOUR OWN code are fine IF your package.json
 * declares "sideEffects": false. This tells webpack it's safe to shake
 * unused re-exports.
 *
 * Without sideEffects: false, webpack may keep all re-exports as insurance
 * against unknown side effects. With it, webpack can statically determine
 * which exports are actually used and discard the rest.
 *
 * Rule of thumb:
 * - Your own barrel files: OK (with sideEffects: false)
 * - Third-party barrel files: avoid importing from them
 * - Instead: import directly from the specific file
 */

// Re-export all math utilities
export { add, subtract, multiply, divide, factorial, fibonacci, processData } from './math';

// Re-export all string utilities
export { capitalize, slugify, truncate, wordCount } from './strings';

// Re-export all date utilities
export { formatDateSafe, relativeTime, daysBetween } from './dates';
