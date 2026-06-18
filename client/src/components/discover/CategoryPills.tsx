'use client';
import { useRouter } from 'next/navigation';
import type { CategoryLite } from '@/lib/discover-types';

export default function CategoryPills({ categories, activeSlug }: { categories: CategoryLite[]; activeSlug?: string }) {
  const router = useRouter();

  return (
    <div className="flex gap-2 overflow-x-auto px-4 sm:px-8 pb-1 scrollbar-thin">
      {categories.map(c => (
        <button
          key={c.id}
          onClick={() => router.push(`/browse/${c.slug}`)}
          className={[
            'flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-colors whitespace-nowrap border',
            activeSlug === c.slug
              ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
              : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500',
          ].join(' ')}
        >
          <span>{c.icon}</span>
          {c.name}
          {typeof c.liveCount === 'number' && c.liveCount > 0 && (
            <span className={activeSlug === c.slug ? 'text-white/70 dark:text-gray-900/60' : 'text-gray-400 dark:text-gray-500'}>
              {c.liveCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
