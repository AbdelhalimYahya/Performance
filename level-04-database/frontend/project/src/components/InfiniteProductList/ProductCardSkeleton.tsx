/**
 * ProductCardSkeleton.tsx — Animated skeleton placeholder
 *
 * Matches the exact layout dimensions of ProductCard to prevent layout shift.
 * Uses CSS pulse animation — no external libraries.
 */

export function ProductCardSkeleton() {
  return (
    <div className="border rounded-lg p-4 bg-white animate-pulse">
      {/* Image placeholder */}
      <div className="w-full h-40 bg-gray-200 rounded-md mb-3" />

      {/* Category badge placeholder */}
      <div className="h-5 w-20 bg-gray-200 rounded-full mb-2" />

      {/* Title placeholder */}
      <div className="h-4 w-3/4 bg-gray-200 rounded mb-2" />

      {/* Price placeholder */}
      <div className="h-5 w-16 bg-gray-200 rounded mb-3" />

      {/* Button placeholder */}
      <div className="h-10 w-full bg-gray-200 rounded" />
    </div>
  );
}

export function ProductCardSkeletonGrid({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
