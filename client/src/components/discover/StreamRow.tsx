'use client';
import StreamCard from './StreamCard';
import type { StreamCard as StreamCardType } from '@/lib/discover-types';

export default function StreamRow({
  title, icon, streams, emptyText,
}: {
  title: string;
  icon?: string;
  streams: StreamCardType[];
  emptyText?: string;
}) {
  if (streams.length === 0 && !emptyText) return null;

  return (
    <section className="mb-10">
      <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 px-4 sm:px-8">
        {icon && <span>{icon}</span>}
        {title}
      </h2>
      {streams.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 px-4 sm:px-8">{emptyText}</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto px-4 sm:px-8 pb-2 scrollbar-thin snap-x">
          {streams.map(s => (
            <div key={s.id} className="w-[260px] sm:w-[280px] flex-shrink-0 snap-start">
              <StreamCard stream={s} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
