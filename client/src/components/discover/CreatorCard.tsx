'use client';
import { useRouter } from 'next/navigation';
import type { CreatorSearchResult } from '@/lib/discover-types';

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export default function CreatorCard({ creator }: { creator: CreatorSearchResult }) {
  const router = useRouter();
  const label = creator.name || creator.username || 'Creator';
  const initial = label.charAt(0).toUpperCase();
  const handle = creator.username ? `@${creator.username}` : creator.id;

  return (
    <button
      onClick={() => router.push(`/creator/${creator.username || creator.id}`)}
      className="flex flex-col items-center text-center gap-2 p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-colors w-full"
    >
      <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
        {creator.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.avatarUrl} alt={label} className="w-full h-full object-cover" />
        ) : (
          <span className="text-lg font-bold text-gray-500 dark:text-gray-400">{initial}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{label}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{handle}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatCount(creator.followerCount)} followers</p>
      </div>
    </button>
  );
}
