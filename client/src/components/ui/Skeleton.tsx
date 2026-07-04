'use client';

// components/ui/Skeleton.tsx
//
// Shared skeleton-loading primitives. Goal: replace bare spinners / blank
// pages with placeholders that match the real layout's shape, so content
// doesn't "pop" or reflow once it arrives (Section 10 of the UX brief:
// "Never show blank white pages").
//
// Base primitives (Skeleton, SkeletonCircle, SkeletonText) are layout-only —
// compose them per-surface rather than building one giant generic loader,
// so each skeleton actually matches what's about to render.

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden bg-gray-200 dark:bg-gray-800 ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 skeleton-shimmer" />
    </div>
  );
}

export function SkeletonCircle({ size = 'w-10 h-10' }: { size?: string }) {
  return <Skeleton className={`rounded-full ${size}`} />;
}

export function SkeletonText({
  lines = 1,
  className = '',
  lastLineWidth = '60%',
}: {
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => {
        const isLast = i === lines - 1 && lines > 1;
        return (
          <div key={i} style={isLast ? { width: lastLineWidth } : undefined}>
            <Skeleton className="h-3 rounded" />
          </div>
        );
      })}
    </div>
  );
}

// ── Composed skeletons for specific surfaces ──────────────────────────────

/** Matches components/discover/StreamCard.tsx dimensions. */
export function StreamCardSkeleton() {
  return (
    <div className="w-full">
      <Skeleton className="aspect-video rounded-xl mb-2.5 w-full" />
      <div className="flex gap-2.5">
        <SkeletonCircle size="w-8 h-8" />
        <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
          <Skeleton className="h-3.5 rounded w-4/5" />
          <Skeleton className="h-3 rounded w-2/5" />
        </div>
      </div>
    </div>
  );
}

/** Matches components/discover/StreamRow.tsx — a horizontally scrolling rail. */
export function StreamRowSkeleton({ title, count = 4 }: { title?: string; count?: number }) {
  return (
    <section className="mb-10">
      <div className="px-4 sm:px-8 mb-4">
        {title ? (
          <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
        ) : (
          <Skeleton className="h-5 w-40 rounded" />
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto px-4 sm:px-8 pb-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="w-[260px] sm:w-[280px] flex-shrink-0">
            <StreamCardSkeleton />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Matches components/discover/CreatorCard.tsx grid. */
export function CreatorCardSkeleton() {
  return (
    <div className="flex flex-col items-center text-center gap-2 p-4 rounded-xl border border-gray-100 dark:border-gray-800 w-full">
      <SkeletonCircle size="w-14 h-14" />
      <div className="min-w-0 w-full space-y-1.5">
        <Skeleton className="h-3.5 rounded w-3/4 mx-auto" />
        <Skeleton className="h-3 rounded w-1/2 mx-auto" />
      </div>
    </div>
  );
}

/** Full-page feed skeleton — several rails stacked, matching app/feed/page.tsx. */
export function FeedPageSkeleton() {
  return (
    <div className="pt-6">
      <StreamRowSkeleton count={5} />
      <StreamRowSkeleton count={5} />
      <StreamRowSkeleton count={4} />
      <section className="mb-10">
        <div className="px-4 sm:px-8 mb-4">
          <Skeleton className="h-5 w-44 rounded" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3 px-4 sm:px-8">
          {Array.from({ length: 8 }).map((_, i) => <CreatorCardSkeleton key={i} />)}
        </div>
      </section>
    </div>
  );
}

/** Generic panel skeleton for Studio tab content while a dynamically-imported
 *  panel chunk loads (see app/studio/page.tsx `TAB_COMPONENTS`). Mimics a
 *  typical panel: a header row + a grid of stat/content blocks, so switching
 *  tabs doesn't flash blank white space. */
export function StudioPanelSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48 rounded" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl w-full" />
    </div>
  );
}
