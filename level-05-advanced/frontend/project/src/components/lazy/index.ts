/**
 * Lazy-loaded components — all wrapped with dynamic() and loading skeletons.
 *
 * Each component has a correctly sized skeleton placeholder to prevent layout shift.
 * Skeleton dimensions match the final component dimensions.
 */
import dynamic from 'next/dynamic';

// ─── LazyHeavyChart ────────────────────────────────────────────
// ~200KB with charting library. Skeleton matches canvas dimensions.
export const LazyHeavyChart = dynamic(
  () => import('./HeavyChart'),
  {
    loading: () => (
      <div className="h-[300px] w-full bg-gray-800 rounded-lg animate-pulse border border-gray-700" />
    ),
    ssr: false,
  }
);

// ─── LazyRichTextEditor ────────────────────────────────────────
// ~150KB with rich text editing. Skeleton is a text area shape.
export const LazyRichTextEditor = dynamic(
  () => import('./RichTextEditor'),
  {
    loading: () => (
      <div className="space-y-3">
        <div className="h-8 w-48 bg-gray-800 rounded animate-pulse" />
        <div className="h-[200px] w-full bg-gray-800 rounded-lg animate-pulse border border-gray-700" />
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-gray-800 rounded animate-pulse" />
          <div className="h-8 w-20 bg-gray-800 rounded animate-pulse" />
          <div className="h-8 w-20 bg-gray-800 rounded animate-pulse" />
        </div>
      </div>
    ),
    ssr: false,
  }
);

// ─── LazyMapComponent ──────────────────────────────────────────
// ~300KB with map tiles. Skeleton is a large square.
export const LazyMapComponent = dynamic(
  () => import('./MapComponent'),
  {
    loading: () => (
      <div className="h-[400px] w-full bg-gray-800 rounded-lg animate-pulse border border-gray-700 flex items-center justify-center">
        <div className="text-gray-600 text-sm">Loading map tiles...</div>
      </div>
    ),
    ssr: false,
  }
);

// ─── LazyVideoPlayer ───────────────────────────────────────────
// ~180KB with video controls. Skeleton is 16:9 aspect ratio.
export const LazyVideoPlayer = dynamic(
  () => import('./VideoPlayer'),
  {
    loading: () => (
      <div className="aspect-video w-full bg-gray-800 rounded-lg animate-pulse border border-gray-700 flex items-center justify-center">
        <div className="text-gray-600 text-sm">Loading video player...</div>
      </div>
    ),
    ssr: false,
  }
);
