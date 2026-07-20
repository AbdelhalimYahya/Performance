/**
 * String utilities — individually exported named exports.
 * Each function is a separate ESM export that can be tree-shaken.
 */

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

export function wordCount(str: string): number {
  return str.trim().split(/\s+/).filter(Boolean).length;
}
