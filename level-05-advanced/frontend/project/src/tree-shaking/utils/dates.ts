/**
 * Date utilities — wraps date-fns using direct sub-module imports.
 *
 * Each import targets a specific file: "date-fns/format", "date-fns/addDays", etc.
 * This ensures tree shaking works — only the imported functions are bundled.
 *
 * BAD:  import { format, addDays, differenceInDays } from "date-fns"
 * GOOD: import { format } from "date-fns/format"
 */
import { format } from 'date-fns/format';
import { addDays } from 'date-fns/addDays';
import { differenceInDays } from 'date-fns/differenceInDays';

export function formatDateSafe(date: Date, pattern: string = 'yyyy-MM-dd'): string {
  return format(date, pattern);
}

export function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

export function daysBetween(dateA: Date, dateB: Date): number {
  return Math.abs(differenceInDays(dateA, dateB));
}
