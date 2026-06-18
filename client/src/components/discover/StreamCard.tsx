'use client';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import type { StreamCard as StreamCardType } from '@/lib/discover-types';

function formatViewers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export default function StreamCard({ stream, size = 'md' }: { stream: StreamCardType; size?: 'sm' | 'md' }) {
  const router = useRouter();
  const creatorLabel = stream.user?.name || stream.user?.username || 'Unknown creator';
  const initial = creatorLabel.charAt(0).toUpperCase();

  return (
    <button
      onClick={() => router.push(`/s/${stream.roomId}`)}
      className="group text-left w-full focus:outline-none"
    >
      <div className={`relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 ${size === 'sm' ? 'aspect-video' : 'aspect-video'} mb-2.5`}>
        {stream.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stream.thumbnailUrl}
            alt={stream.title}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">
            {stream.category?.icon || '📺'}
          </div>
        )}

        {stream.isLive && (
          <span className="absolute top-2 left-2 flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            LIVE
          </span>
        )}

        {stream.isPPV && (
          <span className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            <Lock className="w-2.5 h-2.5" />
            {stream.ppvPrice ? `₹${(stream.ppvPrice / 100).toFixed(0)}` : 'PPV'}
          </span>
        )}

        {stream.isLive && (
          <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
            {formatViewers(stream.viewerCount)} watching
          </span>
        )}
      </div>

      <div className="flex gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {stream.user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stream.user.avatarUrl} alt={creatorLabel} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{initial}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-snug">{stream.title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{creatorLabel}</p>
          {stream.category && (
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{stream.category.icon} {stream.category.name}</p>
          )}
        </div>
      </div>
    </button>
  );
}
